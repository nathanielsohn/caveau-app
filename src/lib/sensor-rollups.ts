import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber } from "./utils";

export interface EnvelopeStats {
  sampleCount: number;
  temp: { min: number; max: number; avg: number } | null;
  humidity: { min: number; max: number; avg: number } | null;
}

function isUtcHourBoundary(date: Date): boolean {
  return (
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * Envelope (min/max/avg + sampleCount) for a locker over a window.
 *
 * Prefers hourly rollups (fast + retained indefinitely). Falls back to raw
 * sensor_readings when rollups are empty (e.g. immediately after deploy,
 * before the nightly rollup cron runs).
 */
export async function getLockerEnvelope(
  lockerId: string,
  start: Date,
  end: Date,
): Promise<EnvelopeStats> {
  const canUseWholeHourRollups =
    end.getTime() > start.getTime() &&
    isUtcHourBoundary(start) &&
    isUtcHourBoundary(end);

  if (canUseWholeHourRollups) {
    const rollups = await prisma.$queryRaw<
      {
        sample_count: bigint | number | null;
        temp_min: Prisma.Decimal | number | null;
        temp_max: Prisma.Decimal | number | null;
        temp_avg: Prisma.Decimal | number | null;
        humidity_min: Prisma.Decimal | number | null;
        humidity_max: Prisma.Decimal | number | null;
        humidity_avg: Prisma.Decimal | number | null;
      }[]
    >`
      SELECT
        SUM(r."sample_count") AS sample_count,
        MIN(r."temperature_min") AS temp_min,
        MAX(r."temperature_max") AS temp_max,
        SUM(r."temperature_avg" * r."sample_count") / NULLIF(SUM(r."sample_count"), 0) AS temp_avg,
        MIN(r."humidity_min") AS humidity_min,
        MAX(r."humidity_max") AS humidity_max,
        SUM(r."humidity_avg" * r."sample_count") / NULLIF(SUM(r."sample_count"), 0) AS humidity_avg
      FROM "sensor_reading_hourly_rollups" r
      WHERE r."locker_id" = ${lockerId}
        AND r."bucket" >= ${start}
        AND r."bucket" < ${end}
    `;

    const rollup = rollups[0];
    const rollupCount = rollup?.sample_count ? Number(rollup.sample_count) : 0;

    if (rollup && rollupCount > 0) {
      return {
        sampleCount: rollupCount,
        temp:
          rollup.temp_min != null &&
          rollup.temp_max != null &&
          rollup.temp_avg != null
            ? {
                min: toNumber(rollup.temp_min),
                max: toNumber(rollup.temp_max),
                avg: toNumber(rollup.temp_avg),
              }
            : null,
        humidity:
          rollup.humidity_min != null &&
          rollup.humidity_max != null &&
          rollup.humidity_avg != null
            ? {
                min: toNumber(rollup.humidity_min),
                max: toNumber(rollup.humidity_max),
                avg: toNumber(rollup.humidity_avg),
              }
            : null,
      };
    }
  }

  const agg = await prisma.sensorReading.aggregate({
    where: { lockerId, timestamp: { gte: start, lte: end } },
    _min: { temperature: true, humidity: true },
    _max: { temperature: true, humidity: true },
    _avg: { temperature: true, humidity: true },
    _count: { _all: true },
  });

  const rawCount = agg._count._all;
  if (!rawCount) {
    return { sampleCount: 0, temp: null, humidity: null };
  }

  return {
    sampleCount: rawCount,
    temp: {
      min: toNumber(agg._min.temperature),
      max: toNumber(agg._max.temperature),
      avg: toNumber(agg._avg.temperature),
    },
    humidity: {
      min: toNumber(agg._min.humidity),
      max: toNumber(agg._max.humidity),
      avg: toNumber(agg._avg.humidity),
    },
  };
}
