-- 0022_ses_feedback.sql
--
-- AWS SES delivers bounce + complaint reports asynchronously via SNS to a
-- subscribed endpoint. Without consuming them, a hard-bouncing or
-- complaining member silently keeps "succeeding" through SES (which then
-- damages the sender reputation) while their inbox never sees an alert.
--
-- These two columns let `/api/ses/webhook` mark the offending member at
-- the moment SNS notifies us, and let `/settings` surface the state so a
-- member can see why their alerts went quiet. We also flip
-- `email_alerts_enabled` to false in the route handler so the next alert
-- write doesn't even attempt the SES call.
--
-- Both columns are nullable — null means "no problem reported", a
-- timestamp means "last bounce/complaint at this time". A future replay
-- of the bounce is allowed to overwrite (we always want the most recent
-- one for ops triage), so no unique constraint here.
BEGIN;

ALTER TABLE members
  ADD COLUMN email_bounced TIMESTAMP(3);

ALTER TABLE members
  ADD COLUMN email_complained TIMESTAMP(3);

COMMIT;
