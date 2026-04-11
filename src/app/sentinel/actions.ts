"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

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
 * Fetch sensor readings for the member's locker within a time range.
 * For longer ranges, downsamples to ~500 evenly-spaced points.
 * Returns data with Prisma Decimals converted to plain numbers.
 */
export async function fetchSensorReadings(
  hoursBack: number
): Promise<DbSensorReading[]> {
  const lockerId = await getMemberLockerId();
  if (!lockerId) return [];

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const readings = await prisma.sensorReading.findMany({
    where: {
      lockerId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "asc" },
  });

  // Downsample to ~500 points for large datasets
  const TARGET_POINTS = 500;
  let sampled = readings;
  if (readings.length > TARGET_POINTS) {
    const step = readings.length / TARGET_POINTS;
    sampled = [];
    for (let i = 0; i < TARGET_POINTS; i++) {
      sampled.push(readings[Math.floor(i * step)]);
    }
    // Always include the last reading
    if (sampled[sampled.length - 1] !== readings[readings.length - 1]) {
      sampled.push(readings[readings.length - 1]);
    }
  }

  return sampled.map((r) => ({
    temperature: Number(r.temperature),
    humidity: Number(r.humidity),
    vibration: Number(r.vibration),
    lightLux: Number(r.lightLux),
    timestamp: r.timestamp.toISOString(),
  }));
}

/**
 * Fetch historical alerts for the member's locker.
 */
export async function fetchAlerts(): Promise<DbAlert[]> {
  const lockerId = await getMemberLockerId();
  if (!lockerId) return [];

  const alerts = await prisma.alert.findMany({
    where: { lockerId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  return alerts.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    timestamp: a.timestamp.toISOString(),
    resolved: a.resolved,
  }));
}
