-- 0044: insurance partner program (feature #31)
--
-- Two-sided workflow: members submit a referral request to apply Caveau's
-- storage-discipline discount with a named carrier (PURE / Chubb / AXA XL /
-- Berkley One). Caveau issues proof-of-storage + standardized CCR exports to
-- the carrier via partner-auth'd /api/insurance/* routes (Bearer secret).
--
-- Schema notes:
--   * `share_token` is the partner-safe reference the member can hand to
--     their agent. Partner APIs scope access to the token (in addition to
--     the shared Bearer secret) so carriers only see the requesting member's
--     reports.
--   * Timestamp columns are nullable per status so the lifecycle can be
--     reconstructed without an event log table at demo scale.

BEGIN;

CREATE TYPE "InsuranceReferralStatus" AS ENUM (
  'submitted',
  'in_review',
  'introduced',
  'bound',
  'declined',
  'cancelled'
);

CREATE TABLE "insurance_referrals" (
  "id"            TEXT                      NOT NULL,
  "member_id"     TEXT                      NOT NULL,
  "partner_name"  TEXT                      NOT NULL,
  "status"        "InsuranceReferralStatus" NOT NULL DEFAULT 'submitted',
  "share_token"   TEXT                      NOT NULL,
  "contact_name"  TEXT,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "policy_number" TEXT,
  "member_note"   TEXT,
  "staff_note"    TEXT,
  "introduced_at" TIMESTAMP(3),
  "bound_at"      TIMESTAMP(3),
  "declined_at"   TIMESTAMP(3),
  "cancelled_at"  TIMESTAMP(3),
  "created_at"    TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)              NOT NULL,
  CONSTRAINT "insurance_referrals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "insurance_referrals"
  ADD CONSTRAINT "insurance_referrals_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "insurance_referrals_share_token_key"
  ON "insurance_referrals" ("share_token");

CREATE INDEX "insurance_referrals_member_id_created_at_idx"
  ON "insurance_referrals" ("member_id", "created_at" DESC);

CREATE INDEX "insurance_referrals_status_created_at_idx"
  ON "insurance_referrals" ("status", "created_at" DESC);

COMMIT;
