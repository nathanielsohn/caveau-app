-- Roadmap #22 — Sensor data pipeline
--
-- Goals:
--   1) Partition raw sensor_readings by month (range on timestamp) so retention
--      and large scans stay fast at scale.
--   2) Add hourly + daily rollup tables for indefinite retention of downsampled
--      sensor history (raw data is still capped at ~90 days).
--   3) Add a tiny state table so cron jobs can run incrementally + safely.

BEGIN;

-- ── Rollup state ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sensor_rollup_state" (
  "id"                INTEGER       NOT NULL,
  "hourly_last_bucket" TIMESTAMP(3),
  "daily_last_bucket"  TIMESTAMP(3),
  "updated_at"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_rollup_state_pkey" PRIMARY KEY ("id")
);

INSERT INTO "sensor_rollup_state" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;

-- ── Rollup tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sensor_reading_hourly_rollups" (
  "locker_id"         TEXT         NOT NULL,
  "bucket"            TIMESTAMP(3) NOT NULL,
  "temperature_avg"   DECIMAL(5,2) NOT NULL,
  "temperature_min"   DECIMAL(5,2) NOT NULL,
  "temperature_max"   DECIMAL(5,2) NOT NULL,
  "humidity_avg"      DECIMAL(5,2) NOT NULL,
  "humidity_min"      DECIMAL(5,2) NOT NULL,
  "humidity_max"      DECIMAL(5,2) NOT NULL,
  "vibration_avg"     DECIMAL(5,3) NOT NULL,
  "vibration_min"     DECIMAL(5,3) NOT NULL,
  "vibration_max"     DECIMAL(5,3) NOT NULL,
  "light_lux_avg"     DECIMAL(5,2) NOT NULL,
  "light_lux_min"     DECIMAL(5,2) NOT NULL,
  "light_lux_max"     DECIMAL(5,2) NOT NULL,
  "sample_count"      INTEGER      NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_reading_hourly_rollups_pkey" PRIMARY KEY ("locker_id", "bucket")
);

ALTER TABLE "sensor_reading_hourly_rollups"
  ADD CONSTRAINT "sensor_reading_hourly_rollups_locker_id_fkey"
  FOREIGN KEY ("locker_id") REFERENCES "lockers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sensor_reading_hourly_rollups_locker_id_bucket_idx"
  ON "sensor_reading_hourly_rollups" ("locker_id", "bucket" DESC);

CREATE TABLE IF NOT EXISTS "sensor_reading_daily_rollups" (
  "locker_id"         TEXT         NOT NULL,
  "bucket"            TIMESTAMP(3) NOT NULL,
  "temperature_avg"   DECIMAL(5,2) NOT NULL,
  "temperature_min"   DECIMAL(5,2) NOT NULL,
  "temperature_max"   DECIMAL(5,2) NOT NULL,
  "humidity_avg"      DECIMAL(5,2) NOT NULL,
  "humidity_min"      DECIMAL(5,2) NOT NULL,
  "humidity_max"      DECIMAL(5,2) NOT NULL,
  "vibration_avg"     DECIMAL(5,3) NOT NULL,
  "vibration_min"     DECIMAL(5,3) NOT NULL,
  "vibration_max"     DECIMAL(5,3) NOT NULL,
  "light_lux_avg"     DECIMAL(5,2) NOT NULL,
  "light_lux_min"     DECIMAL(5,2) NOT NULL,
  "light_lux_max"     DECIMAL(5,2) NOT NULL,
  "sample_count"      INTEGER      NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_reading_daily_rollups_pkey" PRIMARY KEY ("locker_id", "bucket")
);

ALTER TABLE "sensor_reading_daily_rollups"
  ADD CONSTRAINT "sensor_reading_daily_rollups_locker_id_fkey"
  FOREIGN KEY ("locker_id") REFERENCES "lockers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sensor_reading_daily_rollups_locker_id_bucket_idx"
  ON "sensor_reading_daily_rollups" ("locker_id", "bucket" DESC);

-- ── Partition sensor_readings by month ─────────────────────────────────
--
-- Postgres requires that any PRIMARY KEY / UNIQUE constraint on a
-- partitioned table include the partition key. We keep the existing
-- idempotency constraint on (locker_id, timestamp) and switch the table's
-- PRIMARY KEY to (id, timestamp).

-- Preserve the sequence when dropping the legacy table.
ALTER SEQUENCE IF EXISTS "sensor_readings_id_seq" OWNED BY NONE;

ALTER TABLE "sensor_readings" RENAME TO "sensor_readings_legacy";

-- Drop constraint/index names on the legacy table so we can re-use them.
ALTER TABLE "sensor_readings_legacy" DROP CONSTRAINT IF EXISTS "sensor_readings_pkey";
ALTER TABLE "sensor_readings_legacy"
  DROP CONSTRAINT IF EXISTS "sensor_readings_locker_id_timestamp_key";
ALTER TABLE "sensor_readings_legacy" DROP CONSTRAINT IF EXISTS "sensor_readings_locker_id_fkey";
ALTER TABLE "sensor_readings_legacy" DROP CONSTRAINT IF EXISTS "sensor_readings_device_id_fkey";

DROP INDEX IF EXISTS "sensor_readings_locker_id_timestamp_idx";
DROP INDEX IF EXISTS "sensor_readings_device_id_timestamp_idx";

CREATE TABLE "sensor_readings" (
  "id"          INTEGER       NOT NULL DEFAULT nextval('sensor_readings_id_seq'),
  "locker_id"   TEXT          NOT NULL,
  "device_id"   TEXT,
  "temperature" DECIMAL(5,2)  NOT NULL,
  "humidity"    DECIMAL(5,2)  NOT NULL,
  "vibration"   DECIMAL(5,3)  NOT NULL,
  "light_lux"   DECIMAL(5,2)  NOT NULL,
  "timestamp"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id", "timestamp"),
  CONSTRAINT "sensor_readings_locker_id_timestamp_key" UNIQUE ("locker_id", "timestamp")
) PARTITION BY RANGE ("timestamp");

CREATE TABLE IF NOT EXISTS "sensor_readings_default"
  PARTITION OF "sensor_readings" DEFAULT;

-- Create month partitions spanning existing data, plus 2 months ahead, so
-- inserts don't fail at the month boundary.
DO $$
DECLARE
  min_ts TIMESTAMP;
  max_ts TIMESTAMP;
  start_month DATE;
  end_month DATE;
  m DATE;
BEGIN
  SELECT MIN("timestamp"), MAX("timestamp") INTO min_ts, max_ts FROM "sensor_readings_legacy";

  IF min_ts IS NULL OR max_ts IS NULL THEN
    start_month := date_trunc('month', CURRENT_DATE)::date;
    end_month := (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::date;
  ELSE
    start_month := date_trunc('month', min_ts)::date;
    end_month := date_trunc('month', (GREATEST(max_ts, CURRENT_TIMESTAMP) + INTERVAL '2 months'))::date;
  END IF;

  m := start_month;
  WHILE m <= end_month LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS "sensor_readings_%s" PARTITION OF "sensor_readings" FOR VALUES FROM (%L) TO (%L);',
      to_char(m, 'YYYY_MM'),
      m::timestamp,
      (m + INTERVAL '1 month')::timestamp
    );
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;

-- Backfill into the partitioned table, preserving ids.
INSERT INTO "sensor_readings" (
  "id",
  "locker_id",
  "device_id",
  "temperature",
  "humidity",
  "vibration",
  "light_lux",
  "timestamp"
)
SELECT
  "id",
  "locker_id",
  "device_id",
  "temperature",
  "humidity",
  "vibration",
  "light_lux",
  "timestamp"
FROM "sensor_readings_legacy";

-- Keep the id sequence ahead of the copied ids.
SELECT setval(
  'sensor_readings_id_seq',
  GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "sensor_readings"), 1),
  true
);

DROP TABLE "sensor_readings_legacy";

-- Re-own the id sequence now that the legacy table is gone.
ALTER SEQUENCE IF EXISTS "sensor_readings_id_seq" OWNED BY "sensor_readings"."id";

-- Recreate foreign keys and indexes on the partitioned parent.
ALTER TABLE "sensor_readings"
  ADD CONSTRAINT "sensor_readings_locker_id_fkey"
  FOREIGN KEY ("locker_id") REFERENCES "lockers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sensor_readings"
  ADD CONSTRAINT "sensor_readings_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "sentinel_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sensor_readings_locker_id_timestamp_idx"
  ON "sensor_readings" ("locker_id", "timestamp" DESC);

CREATE INDEX "sensor_readings_device_id_timestamp_idx"
  ON "sensor_readings" ("device_id", "timestamp" DESC);

COMMIT;

