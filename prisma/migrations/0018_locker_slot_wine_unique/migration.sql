-- Promote the partial unique index on locker_slots.wine_id to a full
-- UNIQUE constraint so it survives `prisma db push` / `migrate reset`.
-- Postgres treats multiple NULLs as distinct under a plain UNIQUE by
-- default (NULLS DISTINCT), so this is semantically equivalent to the
-- partial index from 0002.
BEGIN;

DROP INDEX IF EXISTS "locker_slots_wine_id_unique";
ALTER TABLE "locker_slots"
  ADD CONSTRAINT "locker_slots_wine_id_key" UNIQUE ("wine_id");

COMMIT;
