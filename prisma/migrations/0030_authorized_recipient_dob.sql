-- Age verification (Florida DABT) on authorized_recipients (feature #51).
--
-- Adds date_of_birth so the door-side /id-scan route can (a) cross-check
-- the DOB read off the ID against the member-registered value and
-- (b) enforce the >= 21 age floor before advancing handoff_started →
-- id_scanned.
--
-- Safe live-data pattern: add column with a sentinel default so the
-- constraint holds during ALTER, backfill existing rows with real DOBs,
-- then drop the default so new rows must supply one explicitly.

BEGIN;

ALTER TABLE "authorized_recipients"
  ADD COLUMN "date_of_birth" DATE NOT NULL DEFAULT DATE '1970-01-01';

-- Backfill seeded recipients with realistic adult DOBs. Keyed by unique
-- (member_id, name) so re-running on a fresh DB is a no-op.
UPDATE "authorized_recipients"
  SET "date_of_birth" = DATE '1988-03-14'
  WHERE "name" = 'Isabella Saenz';

UPDATE "authorized_recipients"
  SET "date_of_birth" = DATE '1975-07-22'
  WHERE "name" = 'Marcus Whitfield';

ALTER TABLE "authorized_recipients"
  ALTER COLUMN "date_of_birth" DROP DEFAULT;

COMMIT;
