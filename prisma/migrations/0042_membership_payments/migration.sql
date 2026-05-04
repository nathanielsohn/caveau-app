-- 0042: membership + payments (feature #27)
--
-- Adds Stripe billing metadata to `members` so the app can link a Caveau
-- account to a Stripe customer + subscription, display billing status on
-- /settings, and keep per-slot storage quantity in sync as lockers change.

BEGIN;

ALTER TABLE "members"
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_subscription_id" TEXT,
  ADD COLUMN "stripe_subscription_status" TEXT,
  ADD COLUMN "stripe_current_period_end" TIMESTAMP(3),
  ADD COLUMN "stripe_storage_item_id" TEXT;

CREATE UNIQUE INDEX "members_stripe_customer_id_key"
  ON "members" ("stripe_customer_id");

CREATE UNIQUE INDEX "members_stripe_subscription_id_key"
  ON "members" ("stripe_subscription_id");

COMMIT;

