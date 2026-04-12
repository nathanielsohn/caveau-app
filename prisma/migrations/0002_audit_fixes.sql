-- Audit fixes migration
-- 1. Bump price decimal precision: Decimal(10,2) → Decimal(12,2)
--    Headroom for wines that auction beyond $100M.
ALTER TABLE "wines" ALTER COLUMN "purchase_price" TYPE DECIMAL(12, 2);
ALTER TABLE "wines" ALTER COLUMN "current_value" TYPE DECIMAL(12, 2);
ALTER TABLE "wine_valuations" ALTER COLUMN "price" TYPE DECIMAL(12, 2);
ALTER TABLE "wine_dispositions" ALTER COLUMN "sale_price" TYPE DECIMAL(12, 2);

-- 2. Wine.memberId: ON DELETE SET NULL → CASCADE
--    Avoids orphaned wines after a member is deleted.
ALTER TABLE "wines" DROP CONSTRAINT "wines_member_id_fkey";
ALTER TABLE "wines" ADD CONSTRAINT "wines_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Drop redundant sensor_readings(timestamp) index.
--    The composite (locker_id, timestamp DESC) index already serves
--    every query path used by the app.
DROP INDEX IF EXISTS "sensor_readings_timestamp_idx";

-- 4. Partial unique index on locker_slots.wine_id to make wine assignment
--    a hard database constraint (defense in depth alongside the
--    Serializable transaction in src/app/locker/actions.ts).
CREATE UNIQUE INDEX IF NOT EXISTS "locker_slots_wine_id_unique"
  ON "locker_slots"("wine_id") WHERE "wine_id" IS NOT NULL;
