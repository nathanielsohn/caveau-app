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
    // Limit to avoid huge payloads for 30D range
    take: hoursBack <= 24 ? 500 : 1000,
  });

  return readings.map((r) => ({
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
