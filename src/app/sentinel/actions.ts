"use server";

import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";
import { notifyAlert } from "@/lib/notify-alert";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { validateLiveAlert } from "@/lib/validate-live-alert";

export interface DbSensorReading {
  temperature: number;
  humidity: number;
  vibration: number;
  lightLux: number;
  timestamp: string; // ISO string for serialization
}

export interface DbAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string; // ISO string
  resolved: boolean;
}

/**
 * Get the member's first locker at the active facility for sensor queries.
 * Sentinel is single-locker today; the facility filter ensures we don't
 * accidentally surface readings from a different location.
 */
async function getMemberLockerContext(): Promise<
  { memberId: string; lockerId: string } | null
> {
  const ctx = await requireMemberFacility();
  if (!ctx) return null;

  const locker = await prisma.locker.findFirst({
    where: { memberId: ctx.memberId, facilityId: ctx.facilityId },
    orderBy: { lockerNumber: "asc" },
    select: { id: true },
  });

  return locker ? { memberId: ctx.memberId, lockerId: locker.id } : null;
}

/**
 * Inner fetch, cached by (lockerId, hoursBack, includeSimulation). Wrapped
 * via unstable_cache so repeated dashboard hits reuse the downsampled
 * payload instead of re-scanning sensor_readings every time. 60s revalidate
 * keeps the live tab feeling fresh while still absorbing bursty traffic.
 *
 * `includeSimulation` controls whether the live-demo (recordLiveAlert)
 * rows show up alongside real device alerts; defaults to false so the
 * audit trail stays clean.
 */
const fetchSentinelDataForLocker = unstable_cache(
  async (lockerId: string, hoursBack: number, includeSimulation: boolean) => {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [readingsRaw, rollups, alerts] = await Promise.all([
      hoursBack <= 24
        ? prisma.sensorReading.findMany({
            where: { lockerId, timestamp: { gte: since } },
            orderBy: { timestamp: "asc" },
          })
        : Promise.resolve([]),
      hoursBack > 24
        ? prisma.sensorReadingHourlyRollup.findMany({
            where: { lockerId, bucket: { gte: since } },
            orderBy: { bucket: "asc" },
            take: 5_000,
          })
        : Promise.resolve([]),
      prisma.alert.findMany({
        where: includeSimulation
          ? { lockerId }
          : { lockerId, source: "device" },
        orderBy: { timestamp: "desc" },
        take: 50,
      }),
    ]);

    const readings =
      hoursBack <= 24
        ? readingsRaw.map((r) => ({
            temperature: Number(r.temperature),
            humidity: Number(r.humidity),
            vibration: Number(r.vibration),
            lightLux: Number(r.lightLux),
            timestamp: r.timestamp.toISOString(),
          }))
        : rollups.map((r) => ({
            temperature: Number(r.temperatureAvg),
            humidity: Number(r.humidityAvg),
            vibration: Number(r.vibrationAvg),
            lightLux: Number(r.lightLuxAvg),
            timestamp: r.bucket.toISOString(),
          }));

    // Downsample readings to ~500 points for large datasets
    const TARGET_POINTS = 500;
    let sampled = readings;
    if (readings.length > TARGET_POINTS) {
      const step = readings.length / TARGET_POINTS;
      sampled = [];
      for (let i = 0; i < TARGET_POINTS; i++) {
        const r = readings[Math.floor(i * step)];
        if (r) sampled.push(r);
      }
      const last = readings[readings.length - 1];
      if (last && sampled[sampled.length - 1] !== last) {
        sampled.push(last);
      }
    }

    return {
      readings: sampled,
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        timestamp: a.timestamp.toISOString(),
        resolved: a.resolved,
      })),
    };
  },
  ["sentinel-data"],
  { revalidate: 60 },
);

/**
 * Fetch sensor readings + alerts for the member's locker in a single round trip.
 * Looks up the locker once, then queries readings (with downsampling) and alerts in parallel.
 * Returns data with Prisma Decimals converted to plain numbers.
 *
 * `hasLocker` lets the client distinguish "no locker at this facility" from
 * "locker has no readings in this range" so it can show a directive empty
 * state instead of blank charts.
 */
export async function fetchSentinelData(
  hoursBack: number,
  includeSimulation: boolean = false,
): Promise<{
  readings: DbSensorReading[];
  alerts: DbAlert[];
  hasLocker: boolean;
}> {
  const ctx = await getMemberLockerContext();
  if (!ctx) return { readings: [], alerts: [], hasLocker: false };
  const data = await fetchSentinelDataForLocker(
    ctx.lockerId,
    hoursBack,
    includeSimulation,
  );
  return { ...data, hasLocker: true };
}

/**
 * Persist a live (client-simulated) threshold breach as a real Alert row and
 * trigger email notification via SES. Scoped to the current member's locker.
 *
 * Returns the new alert id, or null if the member has no locker or the call
 * is not authenticated. Notification dispatch is best-effort and never
 * blocks alert creation — see `notifyAlert`.
 */
export async function recordLiveAlert(input: {
  type: string;
  severity: string;
  message: string;
}): Promise<string | null> {
  const ctx = await getMemberLockerContext();
  if (!ctx) return null;
  const { memberId, lockerId } = ctx;

  // Per-member cap: the client uses a 5-minute dedupe but a malicious caller
  // could still spam this action in a hot loop and grow the alerts table
  // unboundedly. 12/min is comfortably above the legitimate ceiling (one
  // alert per type per cooldown).
  const ip = clientIp(headers());
  const limit = await checkRateLimit(`live-alert:${memberId}:${ip}`, {
    limit: 12,
    windowMs: 60_000,
  });
  if (!limit.allowed) return null;

  // Validate the discriminated-union inputs. Unknown values are rejected
  // silently rather than throwing — the client is a live simulation and we
  // don't want a bad tick to spam error toasts.
  const validation = validateLiveAlert(input);
  if (!validation.ok) return null;
  const { type, severity, message } = validation.data;

  const alert = await prisma.alert.create({
    data: { lockerId, type, severity, message, source: "simulation" },
    select: { id: true },
  });

  // Fire-and-forget notification. `notifyAlert` handles its own errors.
  void notifyAlert(alert.id);

  return alert.id;
}
