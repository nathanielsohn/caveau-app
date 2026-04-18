-- 0027: Biometric-verified "Deliver Now" scaffolding (feature #51)
--
-- What this adds:
--   1. DeliveryStatus / DeliveryEventActor / DeliveryEventType enums — the
--      four-step member ladder (biometric → PIN → address → OTP) plus the
--      door-side handoff states from the pitch deck slide 7 verification
--      ladder.
--   2. delivery_requests — one row per Deliver Now initiation. Carries the
--      PIN/OTP salt+hash pair (SHA-256, see src/lib/delivery.ts), an address
--      snapshot captured at delivery time, and door-side handoff fields
--      (scanned recipient name + photo S3 key).
--   3. delivery_request_items — join to wines with ON DELETE RESTRICT so a
--      wine row can't be deleted while still referenced by a delivery
--      audit trail (same guarantee as wine_dispositions).
--   4. delivery_events — per-transition audit log with JSONB payload for
--      photo keys, failure counters, scanned ID names.
--   5. authorized_recipients — per-member registry used by the door-side
--      name-match check.
BEGIN;

-- 1. Enums
CREATE TYPE "DeliveryStatus" AS ENUM (
  'requested',
  'pin_entered',
  'address_confirmed',
  'otp_verified',
  'handoff_started',
  'id_scanned',
  'completed',
  'cancelled',
  'expired'
);

CREATE TYPE "DeliveryEventActor" AS ENUM (
  'member',
  'staff',
  'system'
);

CREATE TYPE "DeliveryEventType" AS ENUM (
  'requested',
  'biometric_verified',
  'pin_entered',
  'pin_failed',
  'address_confirmed',
  'otp_sent',
  'otp_verified',
  'otp_failed',
  'handoff_started',
  'id_scanned',
  'photo_captured',
  'completed',
  'cancelled',
  'expired'
);

-- 2. delivery_requests
CREATE TABLE "delivery_requests" (
  "id"                       TEXT NOT NULL,
  "member_id"                TEXT NOT NULL,
  "status"                   "DeliveryStatus" NOT NULL DEFAULT 'requested',
  "is_biometric_verified"    BOOLEAN NOT NULL DEFAULT false,
  "pin_salt"                 TEXT NOT NULL,
  "pin_hash"                 TEXT NOT NULL,
  "otp_required"             BOOLEAN NOT NULL DEFAULT false,
  "otp_salt"                 TEXT,
  "otp_hash"                 TEXT,
  "pin_attempts"             INTEGER NOT NULL DEFAULT 0,
  "otp_attempts"             INTEGER NOT NULL DEFAULT 0,
  "pin_verified_at"          TIMESTAMP(3),
  "otp_verified_at"          TIMESTAMP(3),
  "delivery_address_line1"   TEXT NOT NULL,
  "delivery_address_line2"   TEXT,
  "delivery_city"            TEXT NOT NULL,
  "delivery_state"           TEXT NOT NULL,
  "delivery_postal_code"     TEXT NOT NULL,
  "scanned_recipient_name"   TEXT,
  "handoff_photo_key"        TEXT,
  "expires_at"               TIMESTAMP(3) NOT NULL,
  "completed_at"             TIMESTAMP(3),
  "cancelled_at"             TIMESTAMP(3),
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_requests_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE
);

CREATE INDEX "delivery_requests_member_id_created_at_idx"
  ON "delivery_requests" ("member_id", "created_at" DESC);

CREATE INDEX "delivery_requests_status_idx"
  ON "delivery_requests" ("status");

CREATE INDEX "delivery_requests_expires_at_idx"
  ON "delivery_requests" ("expires_at");

-- 3. delivery_request_items
CREATE TABLE "delivery_request_items" (
  "id"                  TEXT NOT NULL,
  "delivery_request_id" TEXT NOT NULL,
  "wine_id"             TEXT NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_request_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_request_items_delivery_request_id_fkey"
    FOREIGN KEY ("delivery_request_id") REFERENCES "delivery_requests"("id") ON DELETE CASCADE,
  CONSTRAINT "delivery_request_items_wine_id_fkey"
    FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "delivery_request_items_delivery_request_id_wine_id_key"
  ON "delivery_request_items" ("delivery_request_id", "wine_id");

CREATE INDEX "delivery_request_items_wine_id_idx"
  ON "delivery_request_items" ("wine_id");

-- 4. delivery_events
CREATE TABLE "delivery_events" (
  "id"                  TEXT NOT NULL,
  "delivery_request_id" TEXT NOT NULL,
  "actor"               "DeliveryEventActor" NOT NULL,
  "type"                "DeliveryEventType" NOT NULL,
  "payload"             JSONB,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_events_delivery_request_id_fkey"
    FOREIGN KEY ("delivery_request_id") REFERENCES "delivery_requests"("id") ON DELETE CASCADE
);

CREATE INDEX "delivery_events_delivery_request_id_created_at_idx"
  ON "delivery_events" ("delivery_request_id", "created_at" DESC);

CREATE INDEX "delivery_events_actor_created_at_idx"
  ON "delivery_events" ("actor", "created_at" DESC);

-- 5. authorized_recipients
CREATE TABLE "authorized_recipients" (
  "id"           TEXT NOT NULL,
  "member_id"    TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "relationship" TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "authorized_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "authorized_recipients_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "authorized_recipients_member_id_name_key"
  ON "authorized_recipients" ("member_id", "name");

CREATE INDEX "authorized_recipients_member_id_idx"
  ON "authorized_recipients" ("member_id");

COMMIT;
