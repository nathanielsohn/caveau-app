-- Driver token on DeliveryRequest (feature #51, Step 3).
--
-- Opens the door-side public URL at `/handoff-driver/[token]`. Nullable
-- because the token is only generated once the member-side ladder reaches
-- its terminal state (address_confirmed when !otpRequired, otp_verified
-- when otpRequired) — a delivery parked mid-ladder should not be
-- reachable by a driver.
--
-- 256-bit random value encoded as base64url (~43 chars). UNIQUE index on
-- a nullable column — Postgres allows multiple NULLs, so pre-tokenization
-- rows and deliveries awaiting member completion coexist without issue.

BEGIN;

ALTER TABLE "delivery_requests"
  ADD COLUMN "driver_token" TEXT;

CREATE UNIQUE INDEX "delivery_requests_driver_token_key"
  ON "delivery_requests"("driver_token");

COMMIT;
