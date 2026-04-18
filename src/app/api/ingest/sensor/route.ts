/**
 * Sentinel device ingestion endpoint (feature #21).
 *
 * Real sensor devices in the field POST each reading here. For the demo the
 * /sentinel page keeps its client-side simulation; this route is what turns
 * the same dashboard into a live view of actual hardware once a device is
 * shipped.
 *
 * Auth: shared-secret Bearer token (`SENTINEL_INGEST_SECRET`). Devices are
 * provisioned with the secret during firmware flash — same trust model the
 * cron route uses for Vercel. When the secret is unset we only allow
 * unauthenticated calls in development/test so local simulation keeps
 * working; staging and production MUST set it.
 *
 * Rate limit: 120 req/min per device, keyed on `lockerId` (one sensor per
 * locker in the current deployment). That's enough headroom for 2 Hz bursts
 * on retry storms without letting a compromised device DDoS the write path.
 * Fail-closed so a Redis outage doesn't silently flood the db.
 *
 * Pipeline:
 *   1. Verify Bearer token.
 *   2. Parse JSON body with `SensorIngestBodySchema`.
 *   3. Rate-limit per-device (after parsing — the key needs the lockerId).
 *   4. Reject timestamps outside ±30 min of now (replay + clock skew guard).
 *   5. Confirm the locker exists (friendly 404 beats a FK violation 500).
 *   6. Insert `SensorReading`.
 *   7. Run `checkThresholds`; for each breach, insert an `Alert` and
 *      fire-and-forget `notifyAlert` (email via SES, handled by #19).
 *
 * The `deviceSignature` field is parsed and recorded in logs for now.
 * A future iteration will HMAC the payload with a per-device key so we can
 * verify the reading came from a specific flashed device, not just anyone
 * who's seen the shared Bearer secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkThresholds, type AlertType, type Severity } from "@/lib/sensors";
import { notifyAlert } from "@/lib/notify-alert";
import { getRequestId } from "@/lib/request-context";
import { parseOr400, SensorIngestBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

// ±30 min window around "now". Anything outside is either a broken clock,
// a queued replay, or a device buffering through an extended outage — all
// cases we want an operator to see, not silently accept.
const MAX_CLOCK_SKEW_MS = 30 * 60 * 1000;

// Collapse bursty threshold breaches into a single Alert row within this
// window. notify-alert.ts enforces its own per-member email cooldown on
// top of this; the DB-row dedup keeps the dashboard and alerts table
// from filling with 100 "temp high" entries when a sensor sits 1°F over
// the limit for an hour. Keep in sync with the default Member
// `emailAlertCooldownMin` so a member's inbox and their dashboard stay
// roughly aligned.
const ALERT_COOLDOWN_MINUTES = 30;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = env.SENTINEL_INGEST_SECRET;
  if (!expected) {
    // Same whitelist as the cron route: dev/test can hit the endpoint
    // without a secret, everything else must configure one.
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  // Length-check first so timingSafeEqual doesn't throw; the length
  // gate itself leaks nothing beyond "wrong-length header," which is
  // also what a naive string compare would reveal.
  const a = Buffer.from(header);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  const requestId = getRequestId();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseOr400(SensorIngestBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  // Rate limit keyed on the device (one sensor per locker today). Fail-closed
  // so an Upstash outage doesn't turn into unbounded writes.
  const rl = await checkRateLimit(`sensor-ingest:${payload.lockerId}`, {
    limit: 120,
    windowMs: 60_000,
    failMode: "closed",
  });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
      },
    );
  }

  const now = Date.now();
  const ts = payload.timestamp.getTime();
  if (Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) {
    return NextResponse.json(
      { error: "Timestamp outside accepted window" },
      { status: 400 },
    );
  }

  const locker = await prisma.locker.findUnique({
    where: { id: payload.lockerId },
    select: { id: true },
  });
  if (!locker) {
    return NextResponse.json({ error: "Locker not found" }, { status: 404 });
  }

  // Idempotent ingest. The @@unique([lockerId, timestamp]) constraint
  // makes a replayed Bearer-authenticated POST a no-op: the catch branch
  // returns 200 without re-running threshold checks or emitting another
  // alert row.
  let readingId: number;
  let isNewReading = true;
  try {
    const reading = await prisma.sensorReading.create({
      data: {
        lockerId: payload.lockerId,
        temperature: new Prisma.Decimal(payload.temperature),
        humidity: new Prisma.Decimal(payload.humidity),
        vibration: new Prisma.Decimal(payload.vibration),
        lightLux: new Prisma.Decimal(payload.lightLux),
        timestamp: payload.timestamp,
      },
      select: { id: true },
    });
    readingId = reading.id;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.sensorReading.findUnique({
        where: {
          lockerId_timestamp: {
            lockerId: payload.lockerId,
            timestamp: payload.timestamp,
          },
        },
        select: { id: true },
      });
      if (!existing) throw err;
      readingId = existing.id;
      isNewReading = false;
    } else {
      throw err;
    }
  }

  if (!isNewReading) {
    logger.info("[ingest/sensor] duplicate reading ignored", {
      requestId,
      lockerId: payload.lockerId,
      readingId,
    });
    return NextResponse.json(
      { status: "ok", readingId, alerts: [], duplicate: true },
      { status: 200 },
    );
  }

  // Evaluate thresholds against the normalized (number) reading — Decimal
  // arithmetic isn't needed here and `checkThresholds` already takes numbers.
  const breaches = checkThresholds({
    temperature: payload.temperature,
    humidity: payload.humidity,
    vibration: payload.vibration,
    lightLux: payload.lightLux,
    timestamp: payload.timestamp,
  });

  const alertCooldownCutoff = new Date(
    Date.now() - ALERT_COOLDOWN_MINUTES * 60_000,
  );

  const alertIds: string[] = [];
  for (const breach of breaches) {
    try {
      // Collapse bursty breaches into a single Alert row per incident.
      // We can't use a DB unique on alerts because `resolved` and
      // `notifiedAt` are mutable; app-level dedup on an open alert of the
      // same (locker, type) within the cooldown window is the fix.
      const recentOpen = await prisma.alert.findFirst({
        where: {
          lockerId: payload.lockerId,
          type: breach.type as AlertType,
          resolved: false,
          timestamp: { gte: alertCooldownCutoff },
          // Only dedup against other device alerts so a simulated alert
          // from the /sentinel demo can't suppress a real breach.
          source: "device",
        },
        select: { id: true },
      });
      if (recentOpen) continue;

      const alert = await prisma.alert.create({
        data: {
          lockerId: payload.lockerId,
          type: breach.type as AlertType,
          severity: breach.severity as Severity,
          message: breach.message,
          timestamp: payload.timestamp,
          source: "device",
        },
        select: { id: true },
      });
      alertIds.push(alert.id);
      void notifyAlert(alert.id);
    } catch (err) {
      logger.error("[ingest/sensor] alert write failed", err, {
        requestId,
        lockerId: payload.lockerId,
        type: breach.type,
      });
    }
  }

  logger.info("[ingest/sensor] reading accepted", {
    requestId,
    lockerId: payload.lockerId,
    readingId,
    alerts: alertIds.length,
  });

  return NextResponse.json(
    {
      status: "ok",
      readingId,
      alerts: alertIds,
    },
    { status: 201 },
  );
}
