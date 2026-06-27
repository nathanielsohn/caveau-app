-- 0049: private locations
--
-- Generalizes the old "home cellar" program into member-owned private
-- locations. Existing home-cellar rows are preserved and converted to the
-- broader `private_location` facility type.

BEGIN;

ALTER TABLE "facilities"
  ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "facilities"
  ALTER COLUMN "type" TYPE TEXT
  USING CASE
    WHEN "type"::TEXT = 'home_cellar' THEN 'private_location'
    ELSE "type"::TEXT
  END;

DROP TYPE "FacilityType";

CREATE TYPE "FacilityType" AS ENUM (
  'vault',
  'private_location'
);

ALTER TABLE "facilities"
  ALTER COLUMN "type" TYPE "FacilityType"
  USING "type"::"FacilityType";

ALTER TABLE "facilities"
  ALTER COLUMN "type" SET DEFAULT 'vault';

CREATE TYPE "PrivateLocationKind" AS ENUM (
  'residence',
  'restaurant',
  'retail',
  'hospitality',
  'office',
  'warehouse',
  'other'
);

ALTER TABLE "home_cellar_installers"
  RENAME TO "location_installers";

ALTER TABLE "facilities"
  RENAME COLUMN "home_cellar_certified_at" TO "private_location_certified_at";

ALTER TABLE "facilities"
  RENAME COLUMN "home_cellar_installer_id" TO "location_installer_id";

ALTER TABLE "facilities"
  ADD COLUMN "owner_member_id" TEXT,
  ADD COLUMN "private_location_kind" "PrivateLocationKind";

UPDATE "facilities" AS f
SET "owner_member_id" = (
  SELECT fm."member_id"
  FROM "facility_members" AS fm
  WHERE fm."facility_id" = f."id"
  ORDER BY fm."created_at" ASC
  LIMIT 1
)
WHERE f."type" = 'private_location'
  AND f."owner_member_id" IS NULL;

UPDATE "facilities"
SET "private_location_kind" = 'residence'
WHERE "type" = 'private_location'
  AND "private_location_kind" IS NULL;

ALTER TABLE "facilities"
  ADD CONSTRAINT "facilities_owner_member_id_fkey"
  FOREIGN KEY ("owner_member_id") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "facilities"
  ADD CONSTRAINT "facilities_private_location_owner_check"
  CHECK (
    (
      "type" = 'private_location'
      AND "owner_member_id" IS NOT NULL
      AND "private_location_kind" IS NOT NULL
    )
    OR
    (
      "type" = 'vault'
      AND "owner_member_id" IS NULL
      AND "private_location_kind" IS NULL
    )
  );

ALTER TABLE "facilities"
  RENAME CONSTRAINT "facilities_home_cellar_installer_id_fkey"
  TO "facilities_location_installer_id_fkey";

ALTER INDEX "home_cellar_installers_active_created_at_idx"
  RENAME TO "location_installers_active_created_at_idx";

ALTER INDEX "facilities_home_cellar_certified_at_idx"
  RENAME TO "facilities_private_location_certified_at_idx";

ALTER INDEX "facilities_home_cellar_installer_id_idx"
  RENAME TO "facilities_location_installer_id_idx";

CREATE INDEX "facilities_owner_member_id_type_idx"
  ON "facilities" ("owner_member_id", "type");

COMMIT;
