-- 0023_alert_source.sql
--
-- Distinguish "real" alerts written by /api/ingest/sensor (a flashed
-- Sentinel device) from "simulation" alerts written by the /sentinel
-- live-demo page (recordLiveAlert). Without this split, a member can
-- POST any message they like through the server action and pollute the
-- audit trail that downstream readers — provenance certificates,
-- handoff bundles, custody reports — present to investors and buyers
-- as if it came from real hardware.
--
-- We default to 'device' so existing rows keep behaving as device
-- alerts (the production ingest endpoint is the only writer in real
-- environments today). The /sentinel page's recordLiveAlert action is
-- the one updated to set 'simulation' explicitly.
BEGIN;

CREATE TYPE "alert_source" AS ENUM ('device', 'simulation');

ALTER TABLE alerts
  ADD COLUMN source "alert_source" NOT NULL DEFAULT 'device';

COMMIT;
