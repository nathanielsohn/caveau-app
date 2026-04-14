"use server";

import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";
import { toNumber } from "@/lib/utils";

export interface EventReport {
  eventId: string;
  lockerCount: number;
  readingCount: number;
  tempMean: number;
  tempMin: number;
  tempMax: number;
  humidityMean: number;
  humidityMin: number;
  humidityMax: number;
  alertCount: number;
}

/**
 * Build a member-facing environmental report for a facility event.
 *
 * Scoped to the caller's own lockers at the event's facility — so the
 * same event id produces different "your cellar" summaries for each
 * member. Returns null when the caller has no active facility, the
 * event doesn't exist, or the event belongs to a different facility.
 *
 * TODO(#19): when this flips from on-demand render to email dispatch,
 * hand the returned EventReport to `src/lib/email.ts` and send via SES
 * with a templated subject line ("Your cellar during Hurricane …").
 * The shape is already flat/serializable so the templating layer
 * doesn't need to touch Prisma.
 */
export async function buildEventReport(
  eventId: string,
): Promise<EventReport | null> {
  const ctx = await requireMemberFacility();
  if (!ctx) return null;

  const event = await prisma.facilityEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      facilityId: true,
      startedAt: true,
      endedAt: true,
    },
  });
  if (!event || event.facilityId !== ctx.facilityId) return null;

  // Only the caller's lockers at this facility — a member doesn't get
  // to see sensor data from lockers they don't own.
  const lockers = await prisma.locker.findMany({
    where: {
      facilityId: event.facilityId,
      memberId: ctx.memberId,
    },
    select: { id: true },
  });
  const lockerIds = lockers.map((l) => l.id);

  if (lockerIds.length === 0) {
    return {
      eventId: event.id,
      lockerCount: 0,
      readingCount: 0,
      tempMean: 0,
      tempMin: 0,
      tempMax: 0,
      humidityMean: 0,
      humidityMin: 0,
      humidityMax: 0,
      alertCount: 0,
    };
  }

  const windowEnd = event.endedAt ?? new Date();

  const [readings, alertCount] = await Promise.all([
    prisma.sensorReading.findMany({
      where: {
        lockerId: { in: lockerIds },
        timestamp: { gte: event.startedAt, lte: windowEnd },
      },
      select: { temperature: true, humidity: true },
    }),
    prisma.alert.count({
      where: {
        lockerId: { in: lockerIds },
        timestamp: { gte: event.startedAt, lte: windowEnd },
        severity: { in: ["warning", "critical"] },
      },
    }),
  ]);

  if (readings.length === 0) {
    return {
      eventId: event.id,
      lockerCount: lockerIds.length,
      readingCount: 0,
      tempMean: 0,
      tempMin: 0,
      tempMax: 0,
      humidityMean: 0,
      humidityMin: 0,
      humidityMax: 0,
      alertCount,
    };
  }

  let tempSum = 0;
  let tempMin = Number.POSITIVE_INFINITY;
  let tempMax = Number.NEGATIVE_INFINITY;
  let humSum = 0;
  let humMin = Number.POSITIVE_INFINITY;
  let humMax = Number.NEGATIVE_INFINITY;

  for (const r of readings) {
    const t = toNumber(r.temperature);
    const h = toNumber(r.humidity);
    tempSum += t;
    if (t < tempMin) tempMin = t;
    if (t > tempMax) tempMax = t;
    humSum += h;
    if (h < humMin) humMin = h;
    if (h > humMax) humMax = h;
  }

  return {
    eventId: event.id,
    lockerCount: lockerIds.length,
    readingCount: readings.length,
    tempMean: tempSum / readings.length,
    tempMin,
    tempMax,
    humidityMean: humSum / readings.length,
    humidityMin: humMin,
    humidityMax: humMax,
    alertCount,
  };
}
