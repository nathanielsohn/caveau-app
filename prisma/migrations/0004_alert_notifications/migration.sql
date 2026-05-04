-- 0004: alert email notifications (feature #19)
--
-- Goals:
--   1. Add per-member email notification preferences: master toggle,
--      minimum severity to notify, and a duplicate-suppression cooldown.
--   2. Add `alerts.notified_at` to record when a notification was sent and
--      to drive cooldown queries. Nullable — historical/seeded alerts stay
--      NULL and are never retroactively emailed.
--   3. Add a supporting index for the cooldown lookup (locker, type,
--      notified_at DESC) so the "was this already emailed in the last N
--      minutes?" check stays cheap as the alerts table grows.
BEGIN;

-- 1. Member preferences.
ALTER TABLE "members"
  ADD COLUMN "email_alerts_enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "email_alert_severity"     TEXT    NOT NULL DEFAULT 'warning',
  ADD COLUMN "email_alert_cooldown_min" INTEGER NOT NULL DEFAULT 30;

-- 2. Alert notification tracking.
ALTER TABLE "alerts"
  ADD COLUMN "notified_at" TIMESTAMP(3);

-- 3. Cooldown index: latest notified alert per (locker, type).
CREATE INDEX "alerts_locker_id_type_notified_at_idx"
  ON "alerts" ("locker_id", "type", "notified_at" DESC);

COMMIT;
