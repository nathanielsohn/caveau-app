-- 0003: cascade graph hardening, decimal headroom, audit columns
--
-- Goals:
--   1. Resolve the Cascade × Restrict conflict between Member→Wine and
--      WineDisposition→Wine. New rule: Member→Wine is RESTRICT and
--      Wine.member_id is NOT NULL. Member deletion now requires soft-delete
--      semantics or explicit cleanup; the FK graph is internally consistent.
--   2. Bump price columns to DECIMAL(14,2) — old DECIMAL(12,2) capped at
--      ~$10M which is below current luxury auction records.
--   3. Add updated_at audit columns to mutable tables. Existing rows get
--      CURRENT_TIMESTAMP as a backfill default; @updatedAt drives subsequent
--      writes through Prisma.
BEGIN;

-- 1. Wine.member_id → NOT NULL + RESTRICT.
--    Fail loudly if any orphan wines exist; we do not silently delete.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "wines" WHERE "member_id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration 0003 aborted: % orphan wines have NULL member_id. Assign or delete before retrying.', orphan_count;
  END IF;
END $$;

ALTER TABLE "wines" ALTER COLUMN "member_id" SET NOT NULL;

ALTER TABLE "wines" DROP CONSTRAINT "wines_member_id_fkey";
ALTER TABLE "wines" ADD CONSTRAINT "wines_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Decimal(12,2) → Decimal(14,2) on every price column.
ALTER TABLE "wines" ALTER COLUMN "purchase_price" TYPE DECIMAL(14, 2);
ALTER TABLE "wines" ALTER COLUMN "current_value" TYPE DECIMAL(14, 2);
ALTER TABLE "wine_valuations" ALTER COLUMN "price" TYPE DECIMAL(14, 2);
ALTER TABLE "wine_dispositions" ALTER COLUMN "sale_price" TYPE DECIMAL(14, 2);

-- 3. updated_at audit columns.
--    DEFAULT CURRENT_TIMESTAMP backfills existing rows; Prisma's @updatedAt
--    handles writes from here on. The default stays in place because Postgres
--    is happy with NOT NULL + DEFAULT, and Prisma overrides on every UPDATE.
ALTER TABLE "members"      ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "wines"        ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lockers"      ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lockers"      ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "locker_slots" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "alerts"       ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
