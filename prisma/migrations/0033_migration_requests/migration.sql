-- 0033: concierge migration requests (feature #52)
--
-- Members upload CellarTracker or Vivino CSV exports and staff fulfill
-- within 48 hours by creating Wine rows. One row per upload, with the
-- column mapping + parsed rows stored as JSON so the admin UI can edit
-- the mapping before fulfillment without a child table.
--
-- `status` drives the state machine: submitted → fulfilled | failed |
-- cancelled. "uploaded" + "mapped" collapse into `submitted` because the
-- member wizard is a single page. `onDelete CASCADE` on member_id matches
-- intake-artifact semantics — fulfilled Wine rows have their own Restrict
-- guarantee once created.

BEGIN;

CREATE TYPE "MigrationSource" AS ENUM ('cellartracker', 'vivino', 'other');
CREATE TYPE "MigrationStatus" AS ENUM ('submitted', 'fulfilled', 'failed', 'cancelled');

CREATE TABLE "migration_requests" (
  "id"                   TEXT              NOT NULL,
  "member_id"            TEXT              NOT NULL,
  "source"               "MigrationSource" NOT NULL,
  "original_filename"    TEXT              NOT NULL,
  "status"               "MigrationStatus" NOT NULL DEFAULT 'submitted',
  "column_mapping"       JSONB             NOT NULL,
  "rows"                 JSONB             NOT NULL,
  "row_count"            INTEGER           NOT NULL,
  "note"                 TEXT,
  "failure_reason"       TEXT,
  "fulfilled_wine_count" INTEGER,
  "fulfilled_at"         TIMESTAMP(3),
  "fulfilled_by_id"      TEXT,
  "cancelled_at"         TIMESTAMP(3),
  "created_at"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "migration_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "migration_requests"
  ADD CONSTRAINT "migration_requests_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "migration_requests_member_id_created_at_idx"
  ON "migration_requests" ("member_id", "created_at" DESC);

CREATE INDEX "migration_requests_status_created_at_idx"
  ON "migration_requests" ("status", "created_at" DESC);

COMMIT;
