-- 0025_member_role_created_at_index.sql
--
-- The /admin/members page sorts the roster by `[role asc, createdAt asc]`
-- (admins first, then staff, then members, each group oldest-first). The
-- pre-existing single-column @@index([role]) couldn't satisfy the second
-- sort key, so Postgres fell back to a sort-after-scan that grew with the
-- member count. Replace it with a composite — Postgres can satisfy
-- role-only filters from the leftmost prefix, so we don't lose anything
-- by dropping the single-column index.
BEGIN;

DROP INDEX IF EXISTS "members_role_idx";
CREATE INDEX "members_role_createdAt_idx" ON "members" ("role", "created_at");

COMMIT;
