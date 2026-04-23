/**
 * Nightly sensor rollup aggregation (roadmap #22).
 *
 * Raw sensor_readings are high-frequency and retained for ~90 days; this cron
 * builds hourly + daily rollup tables that are kept indefinitely so historical
 * reads (charts, provenance, event reports) stay fast as the raw table grows.
 *
 * Auth: shared-secret Bearer token (`CRON_SECRET`), same pattern as the other
 * /api/cron/* routes.
 *
 * Schedule: vercel.json runs this at 02:30 UTC daily so rollups are refreshed
 * before the 03:00 UTC raw-retention sweep fires.
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const INITIAL_LOOKBACK_DAYS = 120;
const HOURLY_OVERLAP_HOURS = 2;
const DAILY_OVERLAP_DAYS = 2;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expectedHeader);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

function floorToUtcHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function floorToUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  const requestId = getRequestId();
  const startedAt = Date.now();
  const now = new Date();

  const state = await prisma.sensorRollupState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    select: { hourlyLastBucket: true, dailyLastBucket: true },
  });

  const hourlyEndExclusive = floorToUtcHour(now);
  const hourlyStart =
    state.hourlyLastBucket != null
      ? addHours(state.hourlyLastBucket, -HOURLY_OVERLAP_HOURS)
      : addDays(hourlyEndExclusive, -INITIAL_LOOKBACK_DAYS);

  const dailyEndExclusive = floorToUtcDay(now);
  const dailyStart =
    state.dailyLastBucket != null
      ? addDays(state.dailyLastBucket, -DAILY_OVERLAP_DAYS)
      : addDays(dailyEndExclusive, -INITIAL_LOOKBACK_DAYS);

  const hourlyAffected = await prisma.$executeRaw`
    INSERT INTO "sensor_reading_hourly_rollups" (
      "locker_id",
      "bucket",
      "temperature_avg",
      "temperature_min",
      "temperature_max",
      "humidity_avg",
      "humidity_min",
      "humidity_max",
      "vibration_avg",
      "vibration_min",
      "vibration_max",
      "light_lux_avg",
      "light_lux_min",
      "light_lux_max",
      "sample_count",
      "updated_at"
    )
    SELECT
      sr."locker_id",
      date_trunc('hour', sr."timestamp") AS bucket,
      ROUND(AVG(sr."temperature")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."temperature")::DECIMAL(5,2),
      MAX(sr."temperature")::DECIMAL(5,2),
      ROUND(AVG(sr."humidity")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."humidity")::DECIMAL(5,2),
      MAX(sr."humidity")::DECIMAL(5,2),
      ROUND(AVG(sr."vibration")::numeric, 3)::DECIMAL(5,3),
      MIN(sr."vibration")::DECIMAL(5,3),
      MAX(sr."vibration")::DECIMAL(5,3),
      ROUND(AVG(sr."light_lux")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."light_lux")::DECIMAL(5,2),
      MAX(sr."light_lux")::DECIMAL(5,2),
      COUNT(*)::int,
      CURRENT_TIMESTAMP
    FROM "sensor_readings" sr
    WHERE sr."timestamp" >= ${hourlyStart}
      AND sr."timestamp" < ${hourlyEndExclusive}
    GROUP BY sr."locker_id", date_trunc('hour', sr."timestamp")
    ON CONFLICT ("locker_id", "bucket") DO UPDATE SET
      "temperature_avg" = EXCLUDED."temperature_avg",
      "temperature_min" = EXCLUDED."temperature_min",
      "temperature_max" = EXCLUDED."temperature_max",
      "humidity_avg" = EXCLUDED."humidity_avg",
      "humidity_min" = EXCLUDED."humidity_min",
      "humidity_max" = EXCLUDED."humidity_max",
      "vibration_avg" = EXCLUDED."vibration_avg",
      "vibration_min" = EXCLUDED."vibration_min",
      "vibration_max" = EXCLUDED."vibration_max",
      "light_lux_avg" = EXCLUDED."light_lux_avg",
      "light_lux_min" = EXCLUDED."light_lux_min",
      "light_lux_max" = EXCLUDED."light_lux_max",
      "sample_count" = EXCLUDED."sample_count",
      "updated_at" = CURRENT_TIMESTAMP
  `;

  const dailyAffected = await prisma.$executeRaw`
    INSERT INTO "sensor_reading_daily_rollups" (
      "locker_id",
      "bucket",
      "temperature_avg",
      "temperature_min",
      "temperature_max",
      "humidity_avg",
      "humidity_min",
      "humidity_max",
      "vibration_avg",
      "vibration_min",
      "vibration_max",
      "light_lux_avg",
      "light_lux_min",
      "light_lux_max",
      "sample_count",
      "updated_at"
    )
    SELECT
      sr."locker_id",
      date_trunc('day', sr."timestamp") AS bucket,
      ROUND(AVG(sr."temperature")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."temperature")::DECIMAL(5,2),
      MAX(sr."temperature")::DECIMAL(5,2),
      ROUND(AVG(sr."humidity")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."humidity")::DECIMAL(5,2),
      MAX(sr."humidity")::DECIMAL(5,2),
      ROUND(AVG(sr."vibration")::numeric, 3)::DECIMAL(5,3),
      MIN(sr."vibration")::DECIMAL(5,3),
      MAX(sr."vibration")::DECIMAL(5,3),
      ROUND(AVG(sr."light_lux")::numeric, 2)::DECIMAL(5,2),
      MIN(sr."light_lux")::DECIMAL(5,2),
      MAX(sr."light_lux")::DECIMAL(5,2),
      COUNT(*)::int,
      CURRENT_TIMESTAMP
    FROM "sensor_readings" sr
    WHERE sr."timestamp" >= ${dailyStart}
      AND sr."timestamp" < ${dailyEndExclusive}
    GROUP BY sr."locker_id", date_trunc('day', sr."timestamp")
    ON CONFLICT ("locker_id", "bucket") DO UPDATE SET
      "temperature_avg" = EXCLUDED."temperature_avg",
      "temperature_min" = EXCLUDED."temperature_min",
      "temperature_max" = EXCLUDED."temperature_max",
      "humidity_avg" = EXCLUDED."humidity_avg",
      "humidity_min" = EXCLUDED."humidity_min",
      "humidity_max" = EXCLUDED."humidity_max",
      "vibration_avg" = EXCLUDED."vibration_avg",
      "vibration_min" = EXCLUDED."vibration_min",
      "vibration_max" = EXCLUDED."vibration_max",
      "light_lux_avg" = EXCLUDED."light_lux_avg",
      "light_lux_min" = EXCLUDED."light_lux_min",
      "light_lux_max" = EXCLUDED."light_lux_max",
      "sample_count" = EXCLUDED."sample_count",
      "updated_at" = CURRENT_TIMESTAMP
  `;

  const newHourlyLastBucket =
    hourlyEndExclusive.getTime() > hourlyStart.getTime()
      ? addHours(hourlyEndExclusive, -1)
      : state.hourlyLastBucket;
  const newDailyLastBucket =
    dailyEndExclusive.getTime() > dailyStart.getTime()
      ? addDays(dailyEndExclusive, -1)
      : state.dailyLastBucket;

  await prisma.sensorRollupState.update({
    where: { id: 1 },
    data: {
      hourlyLastBucket: newHourlyLastBucket ?? null,
      dailyLastBucket: newDailyLastBucket ?? null,
    },
  });

  const durationMs = Date.now() - startedAt;
  logger.info("[cron/sensor-rollups] complete", {
    requestId,
    hourlyAffected: Number(hourlyAffected),
    dailyAffected: Number(dailyAffected),
    hourlyStart: hourlyStart.toISOString(),
    hourlyEndExclusive: hourlyEndExclusive.toISOString(),
    dailyStart: dailyStart.toISOString(),
    dailyEndExclusive: dailyEndExclusive.toISOString(),
    durationMs,
  });

  return NextResponse.json({
    status: "ok",
    hourlyAffected: Number(hourlyAffected),
    dailyAffected: Number(dailyAffected),
    hourlyStart: hourlyStart.toISOString(),
    hourlyEndExclusive: hourlyEndExclusive.toISOString(),
    dailyStart: dailyStart.toISOString(),
    dailyEndExclusive: dailyEndExclusive.toISOString(),
    durationMs,
  });
}

