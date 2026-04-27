-- 0045: home cellar program (feature #48)
--
-- Year 2 hook: support member-enrolled "home cellar" locations alongside
-- Caveau-operated vault facilities. Tracks certification status and the
-- certified installer network.

BEGIN;

CREATE TYPE "FacilityType" AS ENUM (
  'vault',
  'home_cellar'
);

CREATE TABLE "home_cellar_installers" (
  "id"         TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "company"    TEXT,
  "email"      TEXT,
  "phone"      TEXT,
  "region"     TEXT,
  "active"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "home_cellar_installers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "facilities"
  ADD COLUMN "type" "FacilityType" NOT NULL DEFAULT 'vault',
  ADD COLUMN "home_cellar_certified_at" TIMESTAMP(3),
  ADD COLUMN "home_cellar_installer_id" TEXT;

ALTER TABLE "facilities"
  ADD CONSTRAINT "facilities_home_cellar_installer_id_fkey"
  FOREIGN KEY ("home_cellar_installer_id") REFERENCES "home_cellar_installers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "facilities_type_idx" ON "facilities" ("type");
CREATE INDEX "facilities_home_cellar_certified_at_idx"
  ON "facilities" ("home_cellar_certified_at");
CREATE INDEX "facilities_home_cellar_installer_id_idx"
  ON "facilities" ("home_cellar_installer_id");

COMMIT;

