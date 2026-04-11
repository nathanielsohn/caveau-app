"use server";

import { prisma } from "@/lib/prisma";

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
 * Fetch sensor readings for the demo locker within a time range.
 * Returns data with Prisma Decimals converted to plain numbers.
 */
export async function fetchSensorReadings(
  hoursBack: number
): Promise<DbSensorReading[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  // Get the first locker (demo uses locker #7)
  const locker = await prisma.locker.findFirst({
    orderBy: { lockerNumber: "asc" },
  });

  if (!locker) return [];

  const readings = await prisma.sensorReading.findMany({
    where: {
      lockerId: locker.id,
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
 * Fetch historical alerts for the demo locker.
 */
export async function fetchAlerts(): Promise<DbAlert[]> {
  const locker = await prisma.locker.findFirst({
    orderBy: { lockerNumber: "asc" },
  });

  if (!locker) return [];

  const alerts = await prisma.alert.findMany({
    where: { lockerId: locker.id },
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
