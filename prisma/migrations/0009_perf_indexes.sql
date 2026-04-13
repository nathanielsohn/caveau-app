-- 0009: performance index tuning from the post-audit review
--
-- Two index changes that track schema.prisma:
--
--   1. Add (member_id, status, current_value DESC) to wines so the
--      dashboard "top wines by value" query can satisfy the sort
--      from the index. Previously it filtered by (member_id, status)
--      and then did an in-memory sort of up to 500 rows on every
--      dashboard hit.
--   2. Drop the (locker_id, type, notified_at DESC) alert index —
--      it is a strict prefix of the 4-column index added in 0008
--      (locker_id, type, resolved, notified_at), so Postgres can
--      serve both query shapes from the wider index and we avoid
--      paying the write cost on two B-trees.
BEGIN;

CREATE INDEX IF NOT EXISTS "wines_member_status_value_idx"
  ON "wines" ("member_id", "status", "current_value" DESC);

DROP INDEX IF EXISTS "alerts_locker_id_type_notified_at_idx";

COMMIT;
