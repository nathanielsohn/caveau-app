-- 0012: dummy data backfill for demo RDS
--
-- Migration 0010 added facilities.elevation_ft and last_inspection_at
-- as nullable with no backfill, so existing rows (Naples from 0001,
-- Miami from 0006) render as "—" on the /facility dashboard even
-- though seed.ts now sets them. This patches the shared RDS row
-- without requiring a full reseed that would wipe member-entered data.
--
-- Also seeds an event log for both facilities so the demo shows the
-- chain-of-custody story. Inserts are idempotent — guarded by
-- NOT EXISTS so re-running this migration is safe.
BEGIN;

-- 1. Backfill resilience fields by facility name
UPDATE "facilities"
SET "elevation_ft" = 18,
    "last_inspection_at" = NOW() - INTERVAL '42 days'
WHERE "name" = 'Caveau Naples'
  AND "elevation_ft" IS NULL;

UPDATE "facilities"
SET "elevation_ft" = 11,
    "last_inspection_at" = NOW() - INTERVAL '67 days'
WHERE "name" = 'Caveau Miami'
  AND "elevation_ft" IS NULL;

-- 2. Naples event log — only insert when the facility currently has none
INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'hurricane',
  'critical',
  TIMESTAMP '2024-09-26 00:00:00',
  TIMESTAMP '2024-09-28 12:00:00',
  'Hurricane Helene — Category 4 landfall in Big Bend. Facility switched to generator power for 31 hours; Sentinel environmental envelope held within spec throughout. No water intrusion (elevation +18 ft).'
FROM "facilities" f
WHERE f."name" = 'Caveau Naples'
  AND NOT EXISTS (
    SELECT 1 FROM "facility_events" fe WHERE fe."facility_id" = f."id"
  );

INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'generator_test',
  'info',
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '14 days' + INTERVAL '45 minutes',
  'Quarterly 45-minute load test on the Kohler 150 kW standby. Transfer clean, temperature drift < 0.3°F.'
FROM "facilities" f
WHERE f."name" = 'Caveau Naples'
  AND (SELECT COUNT(*) FROM "facility_events" fe WHERE fe."facility_id" = f."id") < 2;

INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'inspection',
  'info',
  NOW() - INTERVAL '42 days',
  NOW() - INTERVAL '42 days' + INTERVAL '3 hours',
  'Semi-annual fire suppression inspection — FM-200 system recertified, no deficiencies noted.'
FROM "facilities" f
WHERE f."name" = 'Caveau Naples'
  AND (SELECT COUNT(*) FROM "facility_events" fe WHERE fe."facility_id" = f."id") < 3;

-- 3. Miami event log — tropical depression (recent, so env report has data),
--    generator test (recent, same reason), inspection (older, matches
--    last_inspection_at for story continuity).
INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'weather',
  'warning',
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '8 days',
  'Tropical depression passed 40 miles offshore. Facility on grid throughout; Sentinel recorded a 0.4°F upward drift during peak humidity but stayed in spec. Zero water intrusion.'
FROM "facilities" f
WHERE f."name" = 'Caveau Miami'
  AND NOT EXISTS (
    SELECT 1 FROM "facility_events" fe WHERE fe."facility_id" = f."id"
  );

INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'generator_test',
  'info',
  NOW() - INTERVAL '21 days',
  NOW() - INTERVAL '21 days' + INTERVAL '40 minutes',
  'Quarterly 40-minute load test on the Kohler 150 kW standby. Automatic transfer switch engaged cleanly; temperature drift negligible.'
FROM "facilities" f
WHERE f."name" = 'Caveau Miami'
  AND (SELECT COUNT(*) FROM "facility_events" fe WHERE fe."facility_id" = f."id") < 2;

INSERT INTO "facility_events" ("id", "facility_id", "type", "severity", "started_at", "ended_at", "notes")
SELECT
  gen_random_uuid()::text,
  f."id",
  'inspection',
  'info',
  NOW() - INTERVAL '67 days',
  NOW() - INTERVAL '67 days' + INTERVAL '2 hours 30 minutes',
  'Semi-annual fire suppression inspection — FM-200 system recertified, all sensors within tolerance, no deficiencies noted.'
FROM "facilities" f
WHERE f."name" = 'Caveau Miami'
  AND (SELECT COUNT(*) FROM "facility_events" fe WHERE fe."facility_id" = f."id") < 3;

COMMIT;
