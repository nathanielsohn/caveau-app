-- 0046: provenance certificate hash verification index
--
-- Public `/verify/[hash]` queries `provenance_certificates` by
-- `data_integrity_hash` and filters to `revoked_at IS NULL`. Add an index so
-- verification stays O(log n) as certificate volume grows.

BEGIN;

CREATE INDEX "provenance_certificates_data_integrity_hash_revoked_at_idx"
  ON "provenance_certificates" ("data_integrity_hash", "revoked_at");

COMMIT;

