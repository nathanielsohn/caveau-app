-- 0017: Hurricane Emergency Collection Protection protocol (feature #46)
--
-- What this adds:
--   1. HurricaneStage enum — left-to-right progression through the protocol.
--   2. Enrollment fields on members — opt-in toggle, enrolled_at, insurance
--      partner/discount for the #31 carrier narrative.
--   3. hurricane_protocols — one row per storm activation at a facility,
--      with a nullable facility_event_id filled in on all-clear so the
--      existing #42 post-event report at /facility/events/[id] picks up
--      the hurricane's environmental summary without a parallel code path.
--   4. hurricane_protocol_members — per-member participation with
--      bottle/value snapshots (captured at pickup) and S3 keys for the
--      intake/return tamper-evidence photos.
BEGIN;

-- 1. HurricaneStage enum
CREATE TYPE "HurricaneStage" AS ENUM (
  'watch_issued',
  'transport_dispatched',
  'sheltered',
  'all_clear',
  'returned',
  'cancelled'
);

-- 2. Enrollment columns on members — backfill is a no-op (defaults handle
-- existing rows; no one is auto-enrolled).
ALTER TABLE "members"
  ADD COLUMN "hurricane_protection_active"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hurricane_protection_enrolled_at" TIMESTAMP(3),
  ADD COLUMN "hurricane_insurance_partner"      TEXT,
  ADD COLUMN "hurricane_insurance_discount_pct" DECIMAL(5, 2);

-- 3. hurricane_protocols table
CREATE TABLE "hurricane_protocols" (
  "id"                      TEXT NOT NULL,
  "facility_id"             TEXT NOT NULL,
  "storm_name"              TEXT NOT NULL,
  "nhc_advisory"            TEXT,
  "category"                INTEGER,
  "stage"                   "HurricaneStage" NOT NULL DEFAULT 'watch_issued',
  "watch_issued_at"         TIMESTAMP(3) NOT NULL,
  "transport_dispatched_at" TIMESTAMP(3),
  "sheltered_at"            TIMESTAMP(3),
  "all_clear_at"            TIMESTAMP(3),
  "returned_at"             TIMESTAMP(3),
  "cancelled_at"            TIMESTAMP(3),
  "facility_event_id"       TEXT,
  "notes"                   TEXT,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hurricane_protocols_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hurricane_protocols_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE,
  CONSTRAINT "hurricane_protocols_facility_event_id_fkey"
    FOREIGN KEY ("facility_event_id") REFERENCES "facility_events"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "hurricane_protocols_facility_event_id_key"
  ON "hurricane_protocols" ("facility_event_id");

CREATE INDEX "hurricane_protocols_facility_id_watch_issued_at_idx"
  ON "hurricane_protocols" ("facility_id", "watch_issued_at" DESC);

CREATE INDEX "hurricane_protocols_stage_idx"
  ON "hurricane_protocols" ("stage");

-- 4. hurricane_protocol_members table
CREATE TABLE "hurricane_protocol_members" (
  "id"                    TEXT NOT NULL,
  "protocol_id"           TEXT NOT NULL,
  "member_id"             TEXT NOT NULL,
  "bottle_count_snapshot" INTEGER,
  "total_value_snapshot"  DECIMAL(14, 2),
  "intake_photo_key"      TEXT,
  "return_photo_key"      TEXT,
  "notes"                 TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hurricane_protocol_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hurricane_protocol_members_protocol_id_fkey"
    FOREIGN KEY ("protocol_id") REFERENCES "hurricane_protocols"("id") ON DELETE CASCADE,
  CONSTRAINT "hurricane_protocol_members_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "hurricane_protocol_members_protocol_id_member_id_key"
  ON "hurricane_protocol_members" ("protocol_id", "member_id");

CREATE INDEX "hurricane_protocol_members_member_id_created_at_idx"
  ON "hurricane_protocol_members" ("member_id", "created_at" DESC);

COMMIT;
