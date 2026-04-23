/**
 * Nightly sensor-readings retention sweep.
 *
 * Ingest is capped at ~120 readings/min/locker (see /api/ingest/sensor),
 * which works out to ~5M rows/year/locker if the cap is sustained. Today
 * there's no cleanup, so the table grows without bound. This cron deletes
 * anything older than `RETENTION_DAYS` so a long-running deployment
 * doesn't quietly run out of disk.
 *
 * This is the interim solution. Roadmap #22 is the real fix —
 * partitioning by month + downsampled rollups so historical reads stay
 * fast at scale. Now that #22 exists, this cron drops whole month
 * partitions when possible and only falls back to chunked deletes for
 * the cutoff-month remainder.
 *
 * Deletes are chunked: a single unbounded DELETE on tens of millions of
 * rows blows past the Vercel `maxDuration` cap and generates a huge WAL
 * batch that fights live ingest writes for row locks. We loop small
 * `DELETE ... LIMIT N` sweeps until either the backlog is drained or we
 * hit a soft deadline, at which point the next cron run finishes the job.
 *
 * Auth: shared-secret Bearer token (`CRON_SECRET`), same pattern as
 * /api/cron/livex-sync. Vercel cron sends the header automatically when
 * `CRON_SECRET` is set; manual curl calls must supply it.
 *
 * Schedule: vercel.json runs this at 03:00 UTC daily, well outside the
 * Sentinel ingest peak window so a long delete doesn't fight live writes
 * for row-level locks.
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const RETENTION_DAYS = 90;
const CHUNK_SIZE = 10_000;
// Hard-cap the in-request loop so we always return before Vercel kills the
// function and leaves us with no log line. Whatever's left rolls forward to
// tomorrow's run.
const SOFT_DEADLINE_MS = 55_000;
// Safety net — if the deadline check somehow misfires (clock skew, a stall
// inside a single DELETE), this caps the absolute number of iterations per
// run so we can't spin forever.
const MAX_ITERATIONS = 2_000;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expectedHeader);
  // timingSafeEqual throws on mismatched lengths, so short-circuit here.
  // The only leak is the overall header length, which is not sensitive.
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  const requestId = getRequestId();

  // Safety gate: never delete raw readings unless daily rollups have been
  // computed through the cutoff window. Otherwise a stuck rollup cron
  // would silently destroy the only copy of historical data.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rollupState = await prisma.sensorRollupState.findUnique({
    where: { id: 1 },
    select: { dailyLastBucket: true },
  });
  if (!rollupState?.dailyLastBucket) {
    logger.warn("[cron/sensor-retention] skipped (rollups not ready)", {
      requestId,
      cutoff: cutoff.toISOString(),
    });
    return NextResponse.json(
      { error: "rollups_not_ready" },
      { status: 503 },
    );
  }
  const cutoffDayStart = new Date(cutoff);
  cutoffDayStart.setUTCHours(0, 0, 0, 0);
  if (rollupState.dailyLastBucket.getTime() < cutoffDayStart.getTime()) {
    logger.warn("[cron/sensor-retention] skipped (rollups stale)", {
      requestId,
      cutoff: cutoff.toISOString(),
      cutoffDayStart: cutoffDayStart.toISOString(),
      dailyLastBucket: rollupState.dailyLastBucket.toISOString(),
    });
    return NextResponse.json(
      { error: "rollups_stale" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();

  // Drop entire month partitions that are fully older than the cutoff.
  // We keep the cutoff month itself because it can contain rows newer than
  // the cutoff timestamp (e.g. cutoff is mid-month).
  const cutoffMonthStart = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));
  try {
    const partitions = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'sensor_readings'
    `;

    const monthPartitions = partitions
      .map((p) => p.relname)
      .filter((name) => /^sensor_readings_\d{4}_\d{2}$/.test(name));

    const toDrop = monthPartitions.filter((name) => {
      const match = name.match(/^sensor_readings_(\d{4})_(\d{2})$/);
      if (!match) return false;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
      const start = new Date(Date.UTC(year, month - 1, 1));
      return start.getTime() < cutoffMonthStart.getTime();
    });

    for (const name of toDrop) {
      // Identifiers can't be parameterized; the regex gate above keeps this safe.
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${name}"`);
    }
  } catch (err) {
    // Partition drops are an optimization; chunked deletes below still enforce
    // retention even if catalog queries are blocked in some environments.
    logger.warn("[cron/sensor-retention] partition drop failed; falling back", {
      requestId,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined,
    });
  }

  let totalDeleted = 0;
  let iterations = 0;
  let completed = false;

  // `DELETE ... WHERE ... LIMIT N` is not standard SQL in Postgres. Use a
  // bounded CTE of primary keys, then delete via a join.
  while (iterations < MAX_ITERATIONS) {
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) break;
    const deleted = await prisma.$executeRaw`
      WITH doomed AS (
        SELECT "id", "timestamp"
        FROM "sensor_readings"
        WHERE "timestamp" < ${cutoff}
        LIMIT ${CHUNK_SIZE}
      )
      DELETE FROM "sensor_readings" sr
      USING doomed d
      WHERE sr."id" = d."id"
        AND sr."timestamp" = d."timestamp"
    `;
    iterations++;
    totalDeleted += Number(deleted);
    if (Number(deleted) < CHUNK_SIZE) {
      completed = true;
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info("[cron/sensor-retention] complete", {
    requestId,
    deleted: totalDeleted,
    iterations,
    completed,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
    durationMs,
  });

  return NextResponse.json({
    status: "ok",
    deleted: totalDeleted,
    iterations,
    completed,
    retentionDays: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    durationMs,
  });
}
