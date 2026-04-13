"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { notifyAlert } from "@/lib/notify-alert";
import type { AlertType, Severity } from "@prisma/client";

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
 * Get the current member's first locker ID for sensor queries.
 */
async function getMemberLockerId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;

  const locker = await prisma.locker.findFirst({
    where: { memberId: session.user.id },
    orderBy: { lockerNumber: "asc" },
    select: { id: true },
  });

  return locker?.id ?? null;
}

/**
 * Fetch sensor readings + alerts for the member's locker in a single round trip.
 * Looks up the locker once, then queries readings (with downsampling) and alerts in parallel.
 * Returns data with Prisma Decimals converted to plain numbers.
 */
export async function fetchSentinelData(
  hoursBack: number
): Promise<{ readings: DbSensorReading[]; alerts: DbAlert[] }> {
  const lockerId = await getMemberLockerId();
  if (!lockerId) return { readings: [], alerts: [] };

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const [readings, alerts] = await Promise.all([
    prisma.sensorReading.findMany({
      where: { lockerId, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.alert.findMany({
      where: { lockerId },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
  ]);

  // Downsample readings to ~500 points for large datasets
  const TARGET_POINTS = 500;
  let sampled = readings;
  if (readings.length > TARGET_POINTS) {
    const step = readings.length / TARGET_POINTS;
    sampled = [];
    for (let i = 0; i < TARGET_POINTS; i++) {
      sampled.push(readings[Math.floor(i * step)]);
    }
    if (sampled[sampled.length - 1] !== readings[readings.length - 1]) {
      sampled.push(readings[readings.length - 1]);
    }
  }

  return {
    readings: sampled.map((r) => ({
      temperature: Number(r.temperature),
      humidity: Number(r.humidity),
      vibration: Number(r.vibration),
      lightLux: Number(r.lightLux),
      timestamp: r.timestamp.toISOString(),
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      timestamp: a.timestamp.toISOString(),
      resolved: a.resolved,
    })),
  };
}

const ALERT_TYPES = new Set<AlertType>([
  "temperature",
  "humidity",
  "vibration",
  "light",
  "door",
  "access",
]);
const SEVERITIES = new Set<Severity>(["info", "warning", "critical"]);

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
  const lockerId = await getMemberLockerId();
  if (!lockerId) return null;

  // Validate the discriminated-union inputs. Unknown values are rejected
  // silently rather than throwing — the client is a live simulation and we
  // don't want a bad tick to spam error toasts.
  const type = input.type as AlertType;
  const severity = input.severity as Severity;
  if (!ALERT_TYPES.has(type)) return null;
  if (!SEVERITIES.has(severity)) return null;
  if (typeof input.message !== "string" || input.message.length === 0) return null;
  const message = input.message.slice(0, 500);

  const alert = await prisma.alert.create({
    data: { lockerId, type, severity, message },
    select: { id: true },
  });

  // Fire-and-forget notification. `notifyAlert` handles its own errors.
  void notifyAlert(alert.id);

  return alert.id;
}
