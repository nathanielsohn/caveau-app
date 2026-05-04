-- Case-insensitive unique email on members + waitlist.
--
-- App code always normalizes email with `.trim().toLowerCase()` before
-- INSERT (see EmailSchema in src/lib/schemas.ts), so in practice every
-- row in these tables is already lowercased. This migration adds a
-- functional UNIQUE INDEX on LOWER(email) as belt-and-braces so a future
-- query path that forgets to normalize can't silently split one member
-- into two accounts (john@... vs John@...).
--
-- The existing `members_email_key` and `waitlist_email_key` unique
-- constraints stay in place — dropping them would need a coordinated
-- data audit first, and keeping both is cheap (two indexes on a small
-- table). The LOWER(email) index is what matters; the original key is
-- redundant for correctness once this lands.
--
-- If a production row exists with uppercase characters in email, this
-- migration fails — which is exactly the signal operators want before
-- flipping the switch. No silent data munging.
--
-- Postgres 12+ supports functional indexes without requiring IMMUTABLE
-- wrapper functions; LOWER() is already marked immutable by the
-- built-in. Safe to run concurrently in production; this migration
-- uses a regular CREATE INDEX for transactional safety.

BEGIN;

CREATE UNIQUE INDEX "members_email_lower_idx"
  ON "members" (LOWER(email));

-- `waitlist` model is mapped to table `waitlist_entries` in schema.prisma
-- (@@map); reference the physical table name here.
CREATE UNIQUE INDEX "waitlist_email_lower_idx"
  ON "waitlist_entries" (LOWER(email));

COMMIT;
