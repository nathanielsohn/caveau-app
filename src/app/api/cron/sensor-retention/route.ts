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
 * fast at scale. Until that lands, 90 days of raw readings is plenty
 * for the live dashboard, charts, and provenance certificates.
 *
 * Auth: shared-secret Bearer token (`CRON_SECRET`), same pattern as
 * /api/cron/livex-sync. Vercel cron sends the header automatically when
 * `CRON_SECRET` is set; manual curl calls must supply it.
 *
 * Schedule: vercel.json runs this at 03:00 UTC daily, well outside the
 * Sentinel ingest peak window so a long delete doesn't fight live writes
 * for row-level locks.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const RETENTION_DAYS = 90;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const startedAt = Date.now();

  const res = await prisma.sensorReading.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  const durationMs = Date.now() - startedAt;
  logger.info("[cron/sensor-retention] complete", {
    deleted: res.count,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
    durationMs,
  });

  return NextResponse.json({
    status: "ok",
    deleted: res.count,
    retentionDays: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    durationMs,
  });
}
