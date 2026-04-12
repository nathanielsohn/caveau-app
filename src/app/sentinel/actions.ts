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
