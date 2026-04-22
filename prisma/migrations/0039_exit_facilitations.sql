-- 0039: exit facilitation workflow (feature #47)
--
-- Slide 5 pairs this with exit signals (#55) as a single narrative: AI
-- flags a sell window → member initiates → Caveau lists on the chosen
-- channel → sale closes with commission tracked. #55 shipped 2026-04-18;
-- this migration + feature #47 finishes the pipeline.
--
-- Workflow-wise this is the mirror of #62 acquisitions: #62 is
-- member-request-for-bottle → staff-sources → fulfillment writes Wine
-- rows, with 8–12% margin as the admin reporting handle. #47 is
-- member-request-for-exit → staff-facilitates → sale close writes a
-- WineDisposition row (type=sold) + flips Wine.status and closes the
-- open ExitSignal on the same wine in a single transaction. Commission
-- (10–12% typical per slide 5) is the admin reporting handle and stays
-- off member-facing routes — same contract as Acquisition.margin_usd.
--
-- Schema choices:
--   * Four-status lifecycle (requested → listed → sold, with withdrawn /
--     cancelled branches). `withdrawn` is staff-authored ("auction pulled
--     the lot", "price floor not met") and requires a reason. `cancelled`
--     is member-authored and only valid pre-listing — once a bottle is
--     listed on a live auction the member cannot cancel, matching how
--     real consignment contracts work.
--   * Channel + auctionHouseName split: `channel` is an enum
--     (auction / broker / private_sale / self_handled) so the lifecycle
--     table can key off it; auction-house names stay free-text so Rob
--     can add Bonhams / Artcurial / Acker without a migration per.
--   * Commission fields (commission_pct, commission_usd) are admin-only
--     by convention — none of the member-facing queries or AI Advisor
--     tools SELECT them. The operator-side CSV export is where they
--     surface.
--   * `net_proceeds_usd` is denormalized (= gross - commission) so the
--     admin CSV / dashboard don't have to recompute per row; the sell
--     action writes all four fields atomically.
--   * Partial unique index on wine_id where status IN ('requested',
--     'listed') enforces "at most one active facilitation per bottle"
--     at the DB level. A second request on the same wine while one is
--     in flight gets a unique-constraint error; the UI surfaces that as
--     "you already have a facilitation open for this bottle".
--   * ON DELETE RESTRICT on wine_id: the existing Wine.dispositions
--     relation already blocks Wine deletion when disposition history
--     exists, but we layer ExitFacilitation's own restrict so a retired
--     exit record (listed but never sold) also keeps the Wine row alive.
--   * `handoff_package_id` is nullable + SET NULL — staff can attach an
--     optional #41 HandoffPackage when an auction house wants an
--     inline CCR + provenance bundle, but the core lifecycle doesn't
--     require one. self_handled channels in particular skip it (the
--     member already has the CCR in their own hands).
--   * `sold_by_id` captures the staff actor who closed the sale for the
--     admin audit trail. ON DELETE SET NULL so staff offboarding doesn't
--     cascade away the financial record.

BEGIN;

CREATE TYPE "ExitStatus" AS ENUM (
  'requested',
  'listed',
  'sold',
  'withdrawn',
  'cancelled'
);

CREATE TYPE "ExitChannel" AS ENUM (
  'auction',
  'broker',
  'private_sale',
  'self_handled'
);

CREATE TABLE "exit_facilitations" (
  "id"                   TEXT          NOT NULL,
  "wine_id"              TEXT          NOT NULL,
  "member_id"            TEXT          NOT NULL,
  -- Member-authored on submit
  "member_note"          TEXT,
  "target_price_low"     DECIMAL(14, 2),
  "target_price_high"    DECIMAL(14, 2),
  "preferred_channel"    "ExitChannel",
  -- Staff-authored as the facilitation moves through requested → listed → sold
  "status"               "ExitStatus"  NOT NULL DEFAULT 'requested',
  "channel"              "ExitChannel",
  "auction_house_name"   TEXT,
  "staff_note"           TEXT,
  "listed_price_usd"     DECIMAL(14, 2),
  -- Settlement (admin-only for commission_*, member-visible for gross/net)
  "gross_proceeds_usd"   DECIMAL(14, 2),
  "commission_pct"       DECIMAL(5, 2),
  "commission_usd"       DECIMAL(14, 2),
  "net_proceeds_usd"     DECIMAL(14, 2),
  -- Lifecycle timestamps
  "listed_at"            TIMESTAMP(3),
  "sold_at"              TIMESTAMP(3),
  "withdrawn_at"         TIMESTAMP(3),
  "withdrawn_reason"     TEXT,
  "cancelled_at"         TIMESTAMP(3),
  "sold_by_id"           TEXT,
  "handoff_package_id"   TEXT,
  "created_at"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "exit_facilitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exit_facilitations_member_id_created_at_idx"
  ON "exit_facilitations" ("member_id", "created_at" DESC);
CREATE INDEX "exit_facilitations_status_created_at_idx"
  ON "exit_facilitations" ("status", "created_at" DESC);
CREATE INDEX "exit_facilitations_wine_id_idx"
  ON "exit_facilitations" ("wine_id");

-- At most one active (non-terminal) facilitation per wine. Prevents the
-- "member accidentally requested an exit twice while staff was working
-- on it" race and doubles as a server-side guard against the UI ever
-- offering the request button while a live row exists.
CREATE UNIQUE INDEX "exit_facilitations_wine_active_uidx"
  ON "exit_facilitations" ("wine_id")
  WHERE status IN ('requested', 'listed');

ALTER TABLE "exit_facilitations"
  ADD CONSTRAINT "exit_facilitations_wine_id_fkey"
  FOREIGN KEY ("wine_id") REFERENCES "wines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exit_facilitations"
  ADD CONSTRAINT "exit_facilitations_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exit_facilitations"
  ADD CONSTRAINT "exit_facilitations_sold_by_id_fkey"
  FOREIGN KEY ("sold_by_id") REFERENCES "members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exit_facilitations"
  ADD CONSTRAINT "exit_facilitations_handoff_package_id_fkey"
  FOREIGN KEY ("handoff_package_id") REFERENCES "handoff_packages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
