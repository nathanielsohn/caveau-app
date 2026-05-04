-- 0021_certificate_revocation.sql
--
-- Certificate hashes are unrevocable bearer tokens today: a leaked
-- /verify/<hash> URL (QR screenshot, email forward, log drain, Referer
-- header) grants anyone on the internet permanent read access. Adding
-- `revoked_at` gives staff a way to invalidate a specific certificate
-- and lets the public verify route filter revoked rows out of the
-- lookup. Nullable so existing rows stay live; setting it to a
-- timestamp is how we mark a report dead.

ALTER TABLE provenance_certificates
  ADD COLUMN revoked_at TIMESTAMP(3);
