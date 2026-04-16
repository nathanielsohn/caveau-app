-- Idempotent sensor ingest: reject duplicate (locker, timestamp) rows at
-- the DB level so a replayed Bearer-authenticated POST can't double-
-- insert a reading or re-trigger threshold checks.
BEGIN;

ALTER TABLE "sensor_readings"
  ADD CONSTRAINT "sensor_readings_locker_id_timestamp_key"
  UNIQUE ("locker_id", "timestamp");

COMMIT;
