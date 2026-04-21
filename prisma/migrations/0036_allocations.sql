-- 0036: allocation access / private release queue (feature #60)
--
-- Founding Member benefit promised on slide 11 ("Day 1 access to private
-- allocations") and quoted at $1.5K–$5K/yr member value on slide 9.
-- Staff posts limited releases with per-tier eligibility; members see the
-- ones they're eligible for and submit requests; staff accepts winners and
-- fulfills by creating Wine rows in the member's collection.
--
-- Two models: Allocation (the release) + AllocationRequest (a member's
-- interest). Child table rather than a JSON blob so (a) admin queues can
-- filter by status with an index, (b) per-member queries ("my requests")
-- are a clean FK lookup, (c) fulfillment can transactionally write Wine
-- rows and flip a single request without rewriting the whole JSON.
--
-- Eligibility: `minimum_tier` is a Tier floor; `founding_only` AND-s a
-- founding-member check on top. `founding_early_access` gives founding
-- members visibility before `opens_at`; after `opens_at` everyone
-- eligible sees it.
--
-- Fulfillment side-effect: `wines.source_allocation_id` back-links the
-- Wine row a fulfilled request produced. `ON DELETE SET NULL` so an
-- allocation can be retired without cascading away the member's actual
-- bottles.

BEGIN;

CREATE TYPE "AllocationStatus" AS ENUM (
  'draft',
  'published',
  'closed',
  'fulfilled',
  'cancelled'
);

CREATE TYPE "AllocationRequestStatus" AS ENUM (
  'submitted',
  'accepted',
  'declined',
  'cancelled',
  'fulfilled'
);

CREATE TABLE "allocations" (
  "id"                      TEXT                NOT NULL,
  "slug"                    TEXT                NOT NULL,
  "producer"                TEXT                NOT NULL,
  "wine_name"               TEXT                NOT NULL,
  "vintage"                 INTEGER             NOT NULL,
  "region"                  TEXT                NOT NULL,
  "varietal"                TEXT                NOT NULL,
  "description"             TEXT,
  "tasting_notes"           TEXT,
  "quantity"                INTEGER             NOT NULL,
  "price_per_bottle_usd"    DECIMAL(14, 2)      NOT NULL,
  "minimum_tier"            "Tier"              NOT NULL,
  "founding_only"           BOOLEAN             NOT NULL DEFAULT false,
  "founding_early_access"   BOOLEAN             NOT NULL DEFAULT false,
  "status"                  "AllocationStatus"  NOT NULL DEFAULT 'draft',
  "hero_image_key"          TEXT,
  "opens_at"                TIMESTAMP(3)        NOT NULL,
  "closes_at"               TIMESTAMP(3)        NOT NULL,
  "published_at"            TIMESTAMP(3),
  "closed_at"               TIMESTAMP(3),
  "created_at"              TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "allocations_slug_key" ON "allocations" ("slug");
CREATE INDEX "allocations_status_opens_at_idx" ON "allocations" ("status", "opens_at");
CREATE INDEX "allocations_minimum_tier_status_idx" ON "allocations" ("minimum_tier", "status");

CREATE TABLE "allocation_requests" (
  "id"                 TEXT                        NOT NULL,
  "allocation_id"      TEXT                        NOT NULL,
  "member_id"          TEXT                        NOT NULL,
  "quantity_requested" INTEGER                     NOT NULL,
  "member_note"        TEXT,
  "status"             "AllocationRequestStatus"   NOT NULL DEFAULT 'submitted',
  "staff_note"         TEXT,
  "accepted_at"        TIMESTAMP(3),
  "declined_at"        TIMESTAMP(3),
  "cancelled_at"       TIMESTAMP(3),
  "fulfilled_at"       TIMESTAMP(3),
  "fulfilled_by_id"    TEXT,
  "created_at"         TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3)                NOT NULL,
  CONSTRAINT "allocation_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "allocation_requests_allocation_id_member_id_key"
  ON "allocation_requests" ("allocation_id", "member_id");
CREATE INDEX "allocation_requests_member_id_created_at_idx"
  ON "allocation_requests" ("member_id", "created_at" DESC);
CREATE INDEX "allocation_requests_status_allocation_id_idx"
  ON "allocation_requests" ("status", "allocation_id");

ALTER TABLE "allocation_requests"
  ADD CONSTRAINT "allocation_requests_allocation_id_fkey"
  FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "allocation_requests"
  ADD CONSTRAINT "allocation_requests_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Provenance back-link on Wine. Nullable: migration-sourced and
-- member-added wines have no originating allocation. SET NULL on
-- allocation delete — a retired allocation shouldn't cascade away the
-- member's bottles.
ALTER TABLE "wines"
  ADD COLUMN "source_allocation_id" TEXT;

ALTER TABLE "wines"
  ADD CONSTRAINT "wines_source_allocation_id_fkey"
  FOREIGN KEY ("source_allocation_id") REFERENCES "allocations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "wines_source_allocation_id_idx"
  ON "wines" ("source_allocation_id");

COMMIT;
