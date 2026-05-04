-- 0010: facility resilience & hurricane reporting (feature #42)
--
-- Goals:
--   1. Extend the facilities table with the resilience fields surfaced
--      on the new /facility dashboard — elevation, generator status,
--      fire suppression status, and last physical inspection timestamp.
--      Defaults are chosen so existing rows keep working without a
--      backfill: generator + fire suppression both default to
--      "operational" (the happy path), elevation and last_inspection_at
--      are nullable so legacy facilities just show "—" in the UI until
--      the operator fills them in.
--   2. Add the facility_events table for logged weather, hurricane,
--      generator_test, inspection, and incident events, plus the
--      supporting FacilityEventType enum. Severity reuses the existing
--      Severity enum so event severity colors match alert severity.
BEGIN;

-- 1. Resilience fields on facilities
ALTER TABLE "facilities"
  ADD COLUMN "elevation_ft" INTEGER,
  ADD COLUMN "generator_status" TEXT NOT NULL DEFAULT 'operational',
  ADD COLUMN "fire_suppression_status" TEXT NOT NULL DEFAULT 'operational',
  ADD COLUMN "last_inspection_at" TIMESTAMP(3);

-- 2. FacilityEventType enum
CREATE TYPE "FacilityEventType" AS ENUM (
  'weather',
  'hurricane',
  'generator_test',
  'inspection',
  'incident'
);

-- 3. facility_events table
CREATE TABLE "facility_events" (
  "id"          TEXT NOT NULL,
  "facility_id" TEXT NOT NULL,
  "type"        "FacilityEventType" NOT NULL,
  "severity"    "Severity" NOT NULL,
  "started_at"  TIMESTAMP(3) NOT NULL,
  "ended_at"    TIMESTAMP(3),
  "notes"       TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facility_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facility_events_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE
);

CREATE INDEX "facility_events_facility_id_started_at_idx"
  ON "facility_events" ("facility_id", "started_at" DESC);

COMMIT;
