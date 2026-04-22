-- 0038: acquisition sourcing workflow (feature #62)
--
-- Slide 15 revenue stream #8: member requests a specific bottle, Caveau
-- sources from broker / auction / Liv-ex / Caveau private network, 8–12%
-- margin recorded. This is the reverse-direction twin of Allocations
-- (#60): #60 is staff-posts-first + member requests off a published
-- release; #62 is member-requests-first + staff sources for them.
--
-- Schema choices:
--   * Single table (`acquisitions`) rather than split into request /
--     fulfillment rows — each acquisition is exactly one workflow; a
--     sibling table would just be JOINed back together on every query.
--   * Single-stage lifecycle (requested → sourcing → fulfilled) instead
--     of a four-stage quote/accept flow. The member-facing accept step
--     requires payment at acceptance (Stripe #27), which isn't built;
--     adding the stage pre-payment would be UX that doesn't do anything.
--     `estimated_total_usd` is still recorded at the sourcing stage and
--     shown to the member so the staff-to-member "quote" communication
--     still has a home — it just isn't a blocking gate.
--   * `source` is nullable until fulfillment. An abandoned sourcing
--     attempt without a final source shouldn't constrain the column.
--   * `actual_cost_usd` + `member_price_usd` + `margin_usd` are all
--     stored (not just margin derived on read) because the admin CSV
--     export needs a single-query reporting handle without per-row
--     arithmetic in the query.
--   * Margin is admin-only reporting — slide 15's "8–12% margin tracked"
--     is the operator's handle, not member-facing. The member sees
--     `member_price_usd`; the cost and margin columns never surface on
--     member routes.
--
-- Provenance back-link on `wines` mirrors `source_allocation_id` from
-- migration 0036: a fulfilled acquisition writes one Wine row per bottle
-- with `source_acquisition_id` pointing back at the request, so bottle
-- detail pages can surface "acquired via Caveau sourcing" and the
-- advisor's `getMyAcquisitions` tool can join back to sourced wines.
-- ON DELETE SET NULL so retiring an acquisition record doesn't cascade
-- away the member's physical inventory.

BEGIN;

CREATE TYPE "AcquisitionStatus" AS ENUM (
  'requested',
  'sourcing',
  'fulfilled',
  'declined',
  'cancelled'
);

CREATE TYPE "AcquisitionSource" AS ENUM (
  'livex',
  'broker',
  'auction',
  'caveau_private'
);

CREATE TABLE "acquisitions" (
  "id"                    TEXT                NOT NULL,
  "member_id"             TEXT                NOT NULL,
  -- Request spec (member-authored on submit)
  "producer"              TEXT                NOT NULL,
  "wine_name"             TEXT,
  "vintage_exact"         INTEGER,
  "vintage_min"           INTEGER,
  "vintage_max"           INTEGER,
  "region"                TEXT,
  "varietal"              TEXT,
  "quantity"              INTEGER             NOT NULL,
  "max_budget_usd"        DECIMAL(14, 2),
  "member_note"           TEXT,
  -- Sourcing state (staff-authored as the request moves through
  -- sourcing → fulfilled)
  "status"                "AcquisitionStatus" NOT NULL DEFAULT 'requested',
  "staff_note"            TEXT,
  "source"                "AcquisitionSource",
  "estimated_total_usd"   DECIMAL(14, 2),
  "actual_cost_usd"       DECIMAL(14, 2),
  "member_price_usd"      DECIMAL(14, 2),
  "margin_usd"            DECIMAL(14, 2),
  -- Lifecycle timestamps
  "sourcing_started_at"   TIMESTAMP(3),
  "fulfilled_at"          TIMESTAMP(3),
  "declined_at"           TIMESTAMP(3),
  "cancelled_at"          TIMESTAMP(3),
  "fulfilled_by_id"       TEXT,
  "created_at"            TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "acquisitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "acquisitions_member_id_created_at_idx"
  ON "acquisitions" ("member_id", "created_at" DESC);
CREATE INDEX "acquisitions_status_created_at_idx"
  ON "acquisitions" ("status", "created_at" DESC);

ALTER TABLE "acquisitions"
  ADD CONSTRAINT "acquisitions_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Wine provenance back-link. Mirrors `source_allocation_id` from
-- migration 0036. Nullable because migration-sourced wines (#52),
-- allocation-sourced wines (#60), manual adds, and legacy rows have no
-- originating acquisition. SET NULL on acquisition delete — a retired
-- acquisition shouldn't cascade away the member's bottles.
ALTER TABLE "wines"
  ADD COLUMN "source_acquisition_id" TEXT;

ALTER TABLE "wines"
  ADD CONSTRAINT "wines_source_acquisition_id_fkey"
  FOREIGN KEY ("source_acquisition_id") REFERENCES "acquisitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "wines_source_acquisition_id_idx"
  ON "wines" ("source_acquisition_id");

COMMIT;
