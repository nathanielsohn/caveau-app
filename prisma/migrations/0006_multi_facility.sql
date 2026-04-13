-- 0006: multi-facility support (feature #16)
--
-- Goals:
--   1. Introduce a many-to-many between members and facilities via a join
--      table so a single member can belong to multiple Caveau locations.
--   2. Promote `lockers.facility_id` from nullable to NOT NULL — every
--      locker now physically belongs to exactly one facility, and the FK
--      moves from ON DELETE SET NULL to ON DELETE RESTRICT so a facility
--      can't be deleted out from under its lockers.
--   3. Backfill so existing data keeps working: any member who already
--      owns a locker becomes a member of that locker's facility, and any
--      member with no lockers gets attached to the oldest facility.
BEGIN;

-- 1. facility_members join table
CREATE TABLE "facility_members" (
  "member_id"   TEXT NOT NULL,
  "facility_id" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facility_members_pkey" PRIMARY KEY ("member_id", "facility_id"),
  CONSTRAINT "facility_members_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE,
  CONSTRAINT "facility_members_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE
);

CREATE INDEX "facility_members_facility_id_idx"
  ON "facility_members"("facility_id");

-- 2. Backfill any orphan locker (facility_id IS NULL) onto the oldest facility
--    so we can flip the column to NOT NULL. If no facility exists at all the
--    UPDATE is a no-op and the ALTER below will fail loudly — that's the
--    correct behavior because a deployment with lockers and zero facilities
--    is already broken state.
UPDATE "lockers"
SET "facility_id" = (
  SELECT "id" FROM "facilities" ORDER BY "created_at" ASC LIMIT 1
)
WHERE "facility_id" IS NULL;

-- 3. Backfill memberships from existing locker ownership
INSERT INTO "facility_members" ("member_id", "facility_id")
SELECT DISTINCT l."member_id", l."facility_id"
FROM "lockers" l
WHERE l."member_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Members with no lockers still need a home facility — attach them to
--    the oldest one so the facility switcher always has at least one entry.
INSERT INTO "facility_members" ("member_id", "facility_id")
SELECT m."id", (SELECT "id" FROM "facilities" ORDER BY "created_at" ASC LIMIT 1)
FROM "members" m
WHERE NOT EXISTS (
  SELECT 1 FROM "facility_members" fm WHERE fm."member_id" = m."id"
)
  AND EXISTS (SELECT 1 FROM "facilities");

-- 5. Tighten lockers.facility_id and swap the FK action
ALTER TABLE "lockers" ALTER COLUMN "facility_id" SET NOT NULL;
ALTER TABLE "lockers" DROP CONSTRAINT IF EXISTS "lockers_facility_id_fkey";
ALTER TABLE "lockers"
  ADD CONSTRAINT "lockers_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT;

COMMIT;
