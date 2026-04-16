-- 0020_session_version.sql
--
-- Add a monotonically increasing session version to each member so that
-- in-flight JWTs can be invalidated server-side. The jwt callback in
-- src/lib/auth.ts re-reads this value on every invocation and forces a
-- re-auth when the DB value is ahead of the token's copy. Demoting an
-- admin or revoking access now takes effect on the next request instead
-- of waiting for the full session maxAge.
--
-- Defaulting to 0 means existing tokens (issued before this migration)
-- don't carry a sessionVersion claim. The jwt callback treats a missing
-- claim as 0, so they remain valid until normal expiry.

ALTER TABLE members
  ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
