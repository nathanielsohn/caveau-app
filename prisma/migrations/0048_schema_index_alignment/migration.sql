-- 0048: schema index alignment
--
-- Normalize indexes that drifted while the repo stored flat SQL files instead
-- of Prisma migration directories. Existing databases may already have some of
-- these from manual SQL application, so keep the repair migration idempotent.

BEGIN;

CREATE INDEX IF NOT EXISTS "home_cellar_installers_active_created_at_idx"
  ON "home_cellar_installers" ("active", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "provenance_certificates_data_integrity_hash_revoked_at_idx"
  ON "provenance_certificates" ("data_integrity_hash", "revoked_at");

CREATE INDEX IF NOT EXISTS "facilities_type_idx"
  ON "facilities" ("type");

CREATE INDEX IF NOT EXISTS "facilities_home_cellar_certified_at_idx"
  ON "facilities" ("home_cellar_certified_at");

CREATE INDEX IF NOT EXISTS "facilities_home_cellar_installer_id_idx"
  ON "facilities" ("home_cellar_installer_id");

COMMIT;
