-- 0016: NFC bottle tracking + tap-to-verify (feature #43)
--
-- Two tables + one enum. See schema.prisma for the full-text rationale.
--
--   nfc_tags  — one row per physical NFC chip applied to a bottle. tag_id is
--               the URL path segment used on the public /bottle/[tagId] page
--               and is UNIQUE so duplicate writes fail at the DB layer.
--               Cascade on wine deletion — a tag without its bottle is
--               meaningless (wines with disposition history are Restrict-
--               guarded upstream, so cascade only fires for rare direct
--               deletes).
--   nfc_scans — one row per public tap. ip_hash is SHA-256(ip + secret);
--               user_agent is truncated to 255 chars at the app layer.
--               Cascade on tag deletion because scan rows without a tag are
--               orphaned noise.
BEGIN;

CREATE TYPE "NfcTagTier" AS ENUM (
  'capsule',
  'collar'
);

CREATE TABLE "nfc_tags" (
  "id"               TEXT NOT NULL,
  "tag_id"           TEXT NOT NULL,
  "wine_id"          TEXT NOT NULL,
  "tier"             "NfcTagTier" NOT NULL,
  "intake_image_key" TEXT,
  "issued_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activated_at"     TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nfc_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nfc_tags_wine_id_fkey"
    FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "nfc_tags_tag_id_key"
  ON "nfc_tags" ("tag_id");

CREATE INDEX "nfc_tags_wine_id_idx"
  ON "nfc_tags" ("wine_id");

CREATE TABLE "nfc_scans" (
  "id"         TEXT NOT NULL,
  "nfc_tag_id" TEXT NOT NULL,
  "ip_hash"    TEXT NOT NULL,
  "user_agent" TEXT,
  "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nfc_scans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nfc_scans_nfc_tag_id_fkey"
    FOREIGN KEY ("nfc_tag_id") REFERENCES "nfc_tags"("id") ON DELETE CASCADE
);

CREATE INDEX "nfc_scans_nfc_tag_id_scanned_at_idx"
  ON "nfc_scans" ("nfc_tag_id", "scanned_at" DESC);

COMMIT;
