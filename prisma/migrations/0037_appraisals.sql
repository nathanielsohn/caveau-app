-- 0037: welcome appraisal / valuation document (feature #61)
--
-- Founding Member benefit promised on slide 11 ("Welcome appraisal by our
-- head sommelier") and quoted as a $5K–$15K Y1 revenue stream on slide 15
-- (Appraisal & Estate Docs). Founding members get one included at
-- onboarding; all other tiers pay per-document via a tier-scaled price
-- resolver in `src/lib/appraisals.ts`.
--
-- Distinct from the Caveau Custody & Condition Report (CCR). A CCR
-- attests to custody and environmental conditions; an Appraisal attests
-- to dollar value at a point in time. The two cross-reference (the
-- appraisal document lists the CCRs that anchor custody during the
-- valuation period) but are independent tables — an appraisal is about
-- a whole portfolio (or a scoped subset), not a single bottle.
--
-- `line_items` stores a JSON snapshot of the bottles the appraiser
-- valued at completion time. This is deliberate: if the member sells or
-- drinks a bottle after the appraisal is issued, the document itself
-- must remain stable (insurance/estate/tax reliance is the whole point).
-- Child-table would force a join on every verify hit and break under
-- portfolio churn.
--
-- `heirs` is a JSON array of { name, share } only populated when
-- `purpose = 'estate'`. Kept as JSON because the shape varies by
-- jurisdiction (some estates list trusts, some list conditional shares)
-- and we don't want to normalize what the member writes verbatim.
--
-- `is_welcome_appraisal` marks the founding freebie. One flag beats a
-- separate `welcome_appraisal_claimed_at` on members because the same
-- existence query answers "has this member claimed their welcome?"
-- (SELECT 1 FROM appraisals WHERE member_id=? AND is_welcome_appraisal).

BEGIN;

CREATE TYPE "AppraisalStatus" AS ENUM (
  'submitted',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE "AppraisalBasis" AS ENUM (
  'fair_market_value',
  'retail_replacement',
  'auction_estimate'
);

CREATE TYPE "AppraisalPurpose" AS ENUM (
  'insurance',
  'estate',
  'tax_donation',
  'divorce',
  'gift',
  'personal'
);

CREATE TABLE "appraisals" (
  "id"                    TEXT                NOT NULL,
  "member_id"             TEXT                NOT NULL,
  "status"                "AppraisalStatus"   NOT NULL DEFAULT 'submitted',
  "purpose"               "AppraisalPurpose"  NOT NULL,
  "basis"                 "AppraisalBasis"    NOT NULL,
  "member_note"           TEXT,
  "scoped_wine_ids"       JSONB,
  "heirs"                 JSONB,
  "appraiser_name"        TEXT,
  "appraiser_creds"       TEXT,
  "scope_of_work"         TEXT,
  "staff_note"            TEXT,
  "effective_date"        TIMESTAMP(3),
  "total_basis_usd"       DECIMAL(14, 2),
  "bottle_count"          INTEGER,
  "line_items"            JSONB,
  "price_charged_usd"     DECIMAL(14, 2),
  "is_welcome_appraisal"  BOOLEAN             NOT NULL DEFAULT false,
  "appraisal_number"      TEXT,
  "data_integrity_hash"   TEXT,
  "revoked_at"            TIMESTAMP(3),
  "completed_at"          TIMESTAMP(3),
  "cancelled_at"          TIMESTAMP(3),
  "created_at"            TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "appraisals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appraisals_appraisal_number_key"
  ON "appraisals" ("appraisal_number");
CREATE INDEX "appraisals_member_id_created_at_idx"
  ON "appraisals" ("member_id", "created_at" DESC);
CREATE INDEX "appraisals_status_created_at_idx"
  ON "appraisals" ("status", "created_at" DESC);
CREATE INDEX "appraisals_data_integrity_hash_idx"
  ON "appraisals" ("data_integrity_hash");

ALTER TABLE "appraisals"
  ADD CONSTRAINT "appraisals_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
