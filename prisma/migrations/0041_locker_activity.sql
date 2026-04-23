-- 0041: locker check-in / check-out (feature #25)
--
-- Adds:
--   1) `wines.barcode` for fast scanner lookup (nullable; existing rows
--      remain untouched).
--   2) `locker_activities` audit log capturing every staff check-in/out
--      action with actor + slot position + timestamp.

BEGIN;

ALTER TABLE "wines"
  ADD COLUMN "barcode" TEXT;

CREATE INDEX "wines_barcode_idx"
  ON "wines" ("barcode");

CREATE TYPE "LockerActivityAction" AS ENUM ('check_in', 'check_out');

CREATE TABLE "locker_activities" (
  "id"              TEXT                  NOT NULL,
  "action"          "LockerActivityAction" NOT NULL,
  "locker_id"       TEXT                  NOT NULL,
  "slot_position"   INTEGER               NOT NULL,
  "wine_id"         TEXT                  NOT NULL,
  "actor_member_id" TEXT                  NOT NULL,
  "occurred_at"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"           TEXT,
  "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "locker_activities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "locker_activities"
  ADD CONSTRAINT "locker_activities_locker_id_fkey"
  FOREIGN KEY ("locker_id") REFERENCES "lockers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "locker_activities"
  ADD CONSTRAINT "locker_activities_wine_id_fkey"
  FOREIGN KEY ("wine_id") REFERENCES "wines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "locker_activities"
  ADD CONSTRAINT "locker_activities_actor_member_id_fkey"
  FOREIGN KEY ("actor_member_id") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "locker_activities_locker_id_occurred_at_idx"
  ON "locker_activities" ("locker_id", "occurred_at" DESC);

CREATE INDEX "locker_activities_wine_id_occurred_at_idx"
  ON "locker_activities" ("wine_id", "occurred_at" DESC);

COMMIT;

