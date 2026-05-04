-- 0031: events & tasting module (feature #53)
--
-- First-class event model so members can RSVP to tastings / dinners and
-- non-members can submit a lead via the public event page. `events` is
-- the primary table; `event_rsvps` and `event_signups` are intentionally
-- separate so admins can cleanly see "members who RSVP'd" vs "leads".
--
-- priceUsd is captured for display only — Stripe wiring belongs with
-- feature #27 (payments). RSVP is treated as confirmed without payment
-- for the pre-launch demo.
--
-- facility_id is nullable (ON DELETE SET NULL) so the Naples Winter Wine
-- Festival can point at a facility without cascading if that facility
-- is ever archived mid-event.
BEGIN;

CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled');

CREATE TABLE "events" (
  "id"             TEXT NOT NULL,
  "facility_id"    TEXT,
  "slug"           TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "summary"        TEXT,
  "description"    TEXT,
  "location_name"  TEXT NOT NULL,
  "location_addr"  TEXT,
  "starts_at"      TIMESTAMP(3) NOT NULL,
  "ends_at"        TIMESTAMP(3) NOT NULL,
  "capacity"       INTEGER NOT NULL,
  "price_usd"      DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "member_only"    BOOLEAN NOT NULL DEFAULT false,
  "status"         "EventStatus" NOT NULL DEFAULT 'published',
  "hero_image_key" TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_slug_key" ON "events" ("slug");
CREATE INDEX "events_starts_at_idx" ON "events" ("starts_at");
CREATE INDEX "events_status_starts_at_idx" ON "events" ("status", "starts_at");

ALTER TABLE "events"
  ADD CONSTRAINT "events_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "event_rsvps" (
  "id"           TEXT NOT NULL,
  "event_id"     TEXT NOT NULL,
  "member_id"    TEXT NOT NULL,
  "seats"        INTEGER NOT NULL DEFAULT 1,
  "notes"        TEXT,
  "cancelled_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_rsvps_event_id_member_id_key"
  ON "event_rsvps" ("event_id", "member_id");
CREATE INDEX "event_rsvps_member_id_created_at_idx"
  ON "event_rsvps" ("member_id", "created_at" DESC);

ALTER TABLE "event_rsvps"
  ADD CONSTRAINT "event_rsvps_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_rsvps"
  ADD CONSTRAINT "event_rsvps_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "event_signups" (
  "id"         TEXT NOT NULL,
  "event_id"   TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "phone"      TEXT,
  "notes"      TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_signups_event_id_email_key"
  ON "event_signups" ("event_id", "email");
CREATE INDEX "event_signups_event_id_created_at_idx"
  ON "event_signups" ("event_id", "created_at" DESC);

ALTER TABLE "event_signups"
  ADD CONSTRAINT "event_signups_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
