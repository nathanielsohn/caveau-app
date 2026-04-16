-- 0014: auction / broker handoff package (feature #41)
--
-- Turns "stored with Caveau" into "ready to transact." A member bundles a
-- single bottle's provenance certificate + full Sentinel history + current
-- Liv-ex valuation + photo into a shareable link, then hands that link to
-- Christie's / Sotheby's / Acker / a private broker. Each recipient view is
-- logged so the member can see who opened the bundle and how often.
--
-- Models:
--   1. handoff_packages — one row per bundle. shareToken is a random
--      URL-safe string used as the public path segment; it's the only
--      secret a third party needs to view the bundle, so the column is
--      UNIQUE and we enforce it at the DB layer (belt + braces against a
--      duplicate generated token).
--   2. handoff_accesses — one row per view. ip_hash is a SHA-256 of the
--      client IP salted with CERTIFICATE_HMAC_SECRET so we can distinguish
--      unique viewers without storing raw IP addresses.
--
-- FK behavior:
--   Wine → package: Cascade. If the member deletes a wine (rare — dispositions
--   are the normal path; wines with dispositions are Restrict-guarded), the
--   handoff bundles pointing at it are meaningless.
--   Member → package: Cascade, mirrors the dispositions pattern.
--   Package → access: Cascade, access rows are worthless without the package.
BEGIN;

CREATE TYPE "HandoffChannel" AS ENUM (
  'auction',
  'broker',
  'private'
);

CREATE TABLE "handoff_packages" (
  "id"              TEXT NOT NULL,
  "wine_id"         TEXT NOT NULL,
  "member_id"       TEXT NOT NULL,
  "recipient_name"  TEXT NOT NULL,
  "recipient_email" TEXT NOT NULL,
  "channel"         "HandoffChannel" NOT NULL,
  "share_token"     TEXT NOT NULL,
  "expires_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_packages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "handoff_packages_wine_id_fkey"
    FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE CASCADE,
  CONSTRAINT "handoff_packages_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "handoff_packages_share_token_key"
  ON "handoff_packages" ("share_token");

CREATE INDEX "handoff_packages_member_id_created_at_idx"
  ON "handoff_packages" ("member_id", "created_at" DESC);

CREATE INDEX "handoff_packages_wine_id_idx"
  ON "handoff_packages" ("wine_id");

CREATE TABLE "handoff_accesses" (
  "id"          TEXT NOT NULL,
  "package_id"  TEXT NOT NULL,
  "ip_hash"     TEXT NOT NULL,
  "user_agent"  TEXT,
  "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_accesses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "handoff_accesses_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "handoff_packages"("id") ON DELETE CASCADE
);

CREATE INDEX "handoff_accesses_package_id_accessed_at_idx"
  ON "handoff_accesses" ("package_id", "accessed_at" DESC);

COMMIT;
