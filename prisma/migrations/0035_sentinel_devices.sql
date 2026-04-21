-- 0035: Sentinel fleet / device admin (feature #58)
--
-- Device-level registry for the Sentinel IoT hardware. Before this, the
-- app only tracked `SensorReading` rows scoped to a locker — there was no
-- way to answer "which device, what firmware, what battery, when did we
-- last hear from it." The fleet view at /admin/sentinels is the
-- investor-facing surface for the "proprietary IoT with patent portfolio"
-- claim on slide 17.
--
-- Design calls:
--   * One `sentinel_devices` row carries both static inventory (serial,
--     model, firmware) and mutable heartbeat state (battery, connectivity,
--     last heartbeat). A 1:1 status table was considered and rejected —
--     heartbeats are read on every admin page load and the join is waste.
--   * `model` is an enum so a Bottle Probe is a device with a type, not a
--     separate table. Probes carry `wine_id` (the bottle they're paired
--     with); locker sensors carry `locker_id`. Same fleet page, same event
--     log, cheap enum switch at the edges.
--   * `bundled_with_tier` (nullable Tier) records WHY a device is with a
--     member — null means the member purchased it outright. More useful
--     than a boolean when a member downgrades tiers and we need to reason
--     about "too many bundled units."
--   * `facility_id` is non-null even for inventory-pool units; we still
--     know which facility stocks them. `locker_id` and `member_id` are
--     null in the pool case.
--   * `alert_routing_config` is opaque JSONB for now ({ channels,
--     severity }). An editor UI lands with #59.
--
-- `sensor_readings.device_id` is a new nullable FK. The ingest route
-- resolves `deviceSignature` → device_id and writes it on new readings;
-- historical rows stay null, no backfill.

BEGIN;

-- ── Enums ──────────────────────────────────────────────────────────────

CREATE TYPE "SentinelModel" AS ENUM ('sentinel_locker', 'bottle_probe');

CREATE TYPE "SentinelConnectivity" AS ENUM ('wifi', 'lte_m', 'offline');

CREATE TYPE "SentinelEventType" AS ENUM (
  'installed',
  'firmware_updated',
  'reassigned',
  'retired',
  'heartbeat_gap',
  'battery_low',
  'connectivity_changed',
  'test_ping'
);

-- ── sentinel_devices ───────────────────────────────────────────────────

CREATE TABLE "sentinel_devices" (
  "id"                    TEXT                    NOT NULL,
  "serial_number"         TEXT                    NOT NULL,
  "model"                 "SentinelModel"         NOT NULL,
  "hardware_rev"          TEXT,
  "firmware_version"      TEXT                    NOT NULL,
  "facility_id"           TEXT                    NOT NULL,
  "locker_id"             TEXT,
  "member_id"             TEXT,
  "wine_id"               TEXT,
  "bundled_with_tier"     "Tier",
  "purchased_at"          TIMESTAMP(3),
  "installed_at"          TIMESTAMP(3),
  "retired_at"            TIMESTAMP(3),
  "connectivity"          "SentinelConnectivity"  NOT NULL DEFAULT 'offline',
  "battery_pct"           INTEGER,
  "last_heartbeat_at"     TIMESTAMP(3),
  "alert_routing_config"  JSONB,
  "created_at"            TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)            NOT NULL,
  CONSTRAINT "sentinel_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sentinel_devices_serial_number_key"
  ON "sentinel_devices" ("serial_number");

ALTER TABLE "sentinel_devices"
  ADD CONSTRAINT "sentinel_devices_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sentinel_devices"
  ADD CONSTRAINT "sentinel_devices_locker_id_fkey"
  FOREIGN KEY ("locker_id") REFERENCES "lockers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sentinel_devices"
  ADD CONSTRAINT "sentinel_devices_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sentinel_devices"
  ADD CONSTRAINT "sentinel_devices_wine_id_fkey"
  FOREIGN KEY ("wine_id") REFERENCES "wines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Admin fleet list sort — "most recently seen" ordering per facility.
CREATE INDEX "sentinel_devices_facility_id_last_heartbeat_at_idx"
  ON "sentinel_devices" ("facility_id", "last_heartbeat_at" DESC);

-- Member-scoped lookups for a future /settings surface (#59).
CREATE INDEX "sentinel_devices_member_id_idx"
  ON "sentinel_devices" ("member_id");

-- "Which device is in this locker?" — at most one locker sensor today,
-- but the index handles the probe-also-in-the-locker future shape too.
CREATE INDEX "sentinel_devices_locker_id_idx"
  ON "sentinel_devices" ("locker_id");

-- Partial index so the "needs attention" filter (stale heartbeat + low
-- battery) doesn't scan retired units.
CREATE INDEX "sentinel_devices_active_idx"
  ON "sentinel_devices" ("last_heartbeat_at" DESC)
  WHERE "retired_at" IS NULL;

-- ── sentinel_device_events ─────────────────────────────────────────────

CREATE TABLE "sentinel_device_events" (
  "id"                TEXT                  NOT NULL,
  "device_id"         TEXT                  NOT NULL,
  "type"              "SentinelEventType"   NOT NULL,
  "actor_member_id"   TEXT,
  "payload"           JSONB,
  "created_at"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sentinel_device_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sentinel_device_events"
  ADD CONSTRAINT "sentinel_device_events_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "sentinel_devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sentinel_device_events"
  ADD CONSTRAINT "sentinel_device_events_actor_member_id_fkey"
  FOREIGN KEY ("actor_member_id") REFERENCES "members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sentinel_device_events_device_id_created_at_idx"
  ON "sentinel_device_events" ("device_id", "created_at" DESC);

-- ── sensor_readings.device_id ──────────────────────────────────────────

ALTER TABLE "sensor_readings"
  ADD COLUMN "device_id" TEXT;

ALTER TABLE "sensor_readings"
  ADD CONSTRAINT "sensor_readings_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "sentinel_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sensor_readings_device_id_timestamp_idx"
  ON "sensor_readings" ("device_id", "timestamp" DESC);

COMMIT;
