-- 0015: founding member waitlist (feature #49)
--
-- Pre-launch lead capture. The `/waitlist` public page inserts rows here;
-- `/admin/waitlist` lists and exports them. Email is unique so a duplicate
-- submit from the same address can be resolved to the existing row instead
-- of creating a second entry. `loi_signed` + `loi_signed_at` track the
-- letter-of-intent state; `referred_by` is intentionally free-form (ops
-- records a founding-member name or a festival code, not an FK).
BEGIN;

CREATE TABLE "waitlist_entries" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "phone"          TEXT,
  "source"         TEXT,
  "notes"          TEXT,
  "loi_signed"     BOOLEAN NOT NULL DEFAULT false,
  "loi_signed_at"  TIMESTAMP(3),
  "referred_by"    TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key"
  ON "waitlist_entries" ("email");

CREATE INDEX "waitlist_entries_created_at_idx"
  ON "waitlist_entries" ("created_at" DESC);

CREATE INDEX "waitlist_entries_loi_signed_idx"
  ON "waitlist_entries" ("loi_signed");

COMMIT;
