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

  const [rollups, alertCount] = await Promise.all([
    prisma.sensorReadingHourlyRollup.findMany({
      where: {
        lockerId: { in: lockerIds },
        bucket: { gte: event.startedAt, lte: windowEnd },
      },
      select: {
        temperatureAvg: true,
        temperatureMin: true,
        temperatureMax: true,
        humidityAvg: true,
        humidityMin: true,
        humidityMax: true,
        sampleCount: true,
      },
    }),
    prisma.alert.count({
      where: {
        lockerId: { in: lockerIds },
        timestamp: { gte: event.startedAt, lte: windowEnd },
        severity: { in: ["warning", "critical"] },
        // Post-event reports describe what real hardware saw; exclude
        // simulated alerts so the event narrative isn't padded.
        source: "device",
      },
    }),
  ]);

  let readingCount = 0;
  let tempMean = 0;
  let tempMin = Number.POSITIVE_INFINITY;
  let tempMax = Number.NEGATIVE_INFINITY;
  let humidityMean = 0;
  let humidityMin = Number.POSITIVE_INFINITY;
  let humidityMax = Number.NEGATIVE_INFINITY;

  if (rollups.length > 0) {
    for (const r of rollups) {
      const count = r.sampleCount;
      if (count <= 0) continue;
      readingCount += count;
      const tAvg = toNumber(r.temperatureAvg);
      const tMin = toNumber(r.temperatureMin);
      const tMax = toNumber(r.temperatureMax);
      const hAvg = toNumber(r.humidityAvg);
      const hMin = toNumber(r.humidityMin);
      const hMax = toNumber(r.humidityMax);
      tempMean += tAvg * count;
      humidityMean += hAvg * count;
      if (tMin < tempMin) tempMin = tMin;
      if (tMax > tempMax) tempMax = tMax;
      if (hMin < humidityMin) humidityMin = hMin;
      if (hMax > humidityMax) humidityMax = hMax;
    }
    if (readingCount > 0) {
      tempMean /= readingCount;
      humidityMean /= readingCount;
    }
  } else {
    const agg = await prisma.sensorReading.aggregate({
      where: {
        lockerId: { in: lockerIds },
        timestamp: { gte: event.startedAt, lte: windowEnd },
      },
      _min: { temperature: true, humidity: true },
      _max: { temperature: true, humidity: true },
      _avg: { temperature: true, humidity: true },
      _count: { _all: true },
    });
    readingCount = agg._count._all;
    if (readingCount > 0) {
      tempMean = toNumber(agg._avg.temperature);
      tempMin = toNumber(agg._min.temperature);
      tempMax = toNumber(agg._max.temperature);
      humidityMean = toNumber(agg._avg.humidity);
      humidityMin = toNumber(agg._min.humidity);
      humidityMax = toNumber(agg._max.humidity);
    }
  }

  if (readingCount === 0) {
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

  return {
    eventId: event.id,
    lockerCount: lockerIds.length,
    readingCount,
    tempMean,
    tempMin,
    tempMax,
    humidityMean,
    humidityMin,
    humidityMax,
    alertCount,
  };
}
