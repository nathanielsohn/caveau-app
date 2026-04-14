-- 0013: audit hardening
--
-- 1. Change lockers.member_id FK to ON DELETE RESTRICT. Orphaning a locker
--    by SET NULL drops the audit trail of who owned a physical asset — we'd
--    rather fail the member delete than lose the link. Wine already uses
--    Restrict (0003); this aligns the two.
--
-- 2. Drop the redundant wines(member_id) index. It is a strict prefix of
--    wines(member_id, status) added in 0001 and wines(member_id, status,
--    current_value DESC) added in 0009, so every query that used it can be
--    satisfied by a wider existing B-tree.
BEGIN;

ALTER TABLE "lockers"
  DROP CONSTRAINT IF EXISTS "lockers_member_id_fkey";

ALTER TABLE "lockers"
  ADD CONSTRAINT "lockers_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "wines_member_id_idx";

COMMIT;
