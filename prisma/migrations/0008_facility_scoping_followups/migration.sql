-- 0008: facility-scoping follow-ups + cleanup from the post-merge audit
--
-- Three independent fixes, grouped because they all came out of the same
-- audit pass and each one is small enough that a separate migration would
-- be more ceremony than signal:
--
--   1. Locker.lockerNumber must be unique PER facility, not globally.
--      The 0001 schema gave it a single global @unique constraint, which
--      0006 (multi-facility) failed to relax. Two facilities both wanting
--      a locker #7 currently fail with a P2002 in seed and in production.
--   2. Drop wines.image_url. 0007 left it in place "for legacy seed data"
--      but nothing reads or writes it anymore — keeping a dead column
--      around is just an opportunity for someone to populate the wrong one.
--   3. Add (locker_id, type, resolved, notified_at DESC) to alerts so the
--      notify-alert cooldown query has a covering index. The previous index
--      lacked `resolved` and degraded as the alerts table grew.
BEGIN;

-- 1. Per-facility locker numbering
ALTER TABLE "lockers" DROP CONSTRAINT IF EXISTS "lockers_locker_number_key";
ALTER TABLE "lockers"
  ADD CONSTRAINT "lockers_facility_id_locker_number_key"
  UNIQUE ("facility_id", "locker_number");

-- 2. Drop legacy image URL column
ALTER TABLE "wines" DROP COLUMN IF EXISTS "image_url";

-- 3. Cooldown index that includes `resolved`
CREATE INDEX IF NOT EXISTS "alerts_locker_type_resolved_notified_idx"
  ON "alerts" ("locker_id", "type", "resolved", "notified_at" DESC);

COMMIT;
