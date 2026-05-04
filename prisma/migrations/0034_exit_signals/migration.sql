-- 0034: exit signals (feature #55)
--
-- AI-surfaced sell-window alerts per bottle, tied to drink-window timing
-- plus 12-month price momentum. Visible on the dashboard, the wine detail
-- page, and the AI Advisor; feeds into the existing handoff package flow
-- (#41) as the on-ramp to exit facilitation (#47, not yet built).
--
-- "Open" = `closed_at IS NULL`. A wine can accumulate multiple historical
-- signals over time but at most one open signal at a time — the partial
-- unique index below enforces that at the DB level so the scoring pass in
-- src/lib/exit-signals.ts can upsert without racing itself.

BEGIN;

CREATE TYPE "ExitSignalReason" AS ENUM (
  'drink_window_closing',
  'peak_momentum',
  'dual'
);

CREATE TYPE "ExitSignalStrength" AS ENUM ('moderate', 'strong');

CREATE TABLE "exit_signals" (
  "id"                  TEXT                 NOT NULL,
  "wine_id"             TEXT                 NOT NULL,
  "member_id"           TEXT                 NOT NULL,
  "reason"              "ExitSignalReason"   NOT NULL,
  "strength"            "ExitSignalStrength" NOT NULL,
  "rationale"           TEXT                 NOT NULL,
  "price_snapshot"      DECIMAL(14, 2)       NOT NULL,
  "target_price_low"    DECIMAL(14, 2)       NOT NULL,
  "target_price_high"   DECIMAL(14, 2)       NOT NULL,
  "momentum_12mo_pct"   DECIMAL(6, 2),
  "opened_at"           TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at"           TIMESTAMP(3),
  "closed_reason"       TEXT,
  "created_at"          TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)         NOT NULL,
  CONSTRAINT "exit_signals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "exit_signals"
  ADD CONSTRAINT "exit_signals_wine_id_fkey"
  FOREIGN KEY ("wine_id") REFERENCES "wines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exit_signals"
  ADD CONSTRAINT "exit_signals_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "exit_signals_member_id_closed_at_opened_at_idx"
  ON "exit_signals" ("member_id", "closed_at", "opened_at" DESC);

CREATE INDEX "exit_signals_wine_id_closed_at_idx"
  ON "exit_signals" ("wine_id", "closed_at");

-- Partial unique index: at most one *open* signal per wine. Historical
-- rows (closed_at IS NOT NULL) are free to accumulate. Not expressible in
-- Prisma schema directly — kept here as a DB-level safety net for the
-- scoring pass, which upserts in-place rather than creating dupes.
CREATE UNIQUE INDEX "exit_signals_wine_id_open_unique"
  ON "exit_signals" ("wine_id")
  WHERE "closed_at" IS NULL;

COMMIT;
