-- 0005: member onboarding flag (feature #20)
--
-- Goals:
--   1. Add nullable `members.onboarded_at` so we can distinguish brand-new
--      signups from members who finished the guided walkthrough (tier
--      selection → locker reservation → first bottle).
--   2. Backfill all existing members to NOW() — they pre-date the wizard
--      and are already fully set up, so they should never be punted to it.
BEGIN;

ALTER TABLE "members"
  ADD COLUMN "onboarded_at" TIMESTAMP(3);

UPDATE "members" SET "onboarded_at" = CURRENT_TIMESTAMP;

COMMIT;
