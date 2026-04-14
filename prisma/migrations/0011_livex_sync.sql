-- 0010: Liv-ex live pricing integration (feature #39)
--
-- Adds `wines.last_valuation_sync_at` so the UI can surface a
-- "Last updated <relative time>" label on the dashboard collection-value
-- card and the per-wine valuation chart. Null for wines that have never
-- been synced against Liv-ex — the UI falls back to the most recent
-- WineValuation.date in that case, so existing seeded demo data keeps
-- working unchanged.
--
-- The column is populated by the daily sync job at
-- `/api/cron/livex-sync` (wired to Vercel cron), which hits the real
-- Liv-ex API via `src/lib/livex.ts` and inserts one new WineValuation
-- row per bottle with source = 'liv-ex'. When the API is unreachable or
-- LIVEX_API_KEY is unset the sync no-ops and the column is left alone,
-- which is also why the UI treats the timestamp as optional.
BEGIN;

ALTER TABLE "wines"
  ADD COLUMN "last_valuation_sync_at" TIMESTAMP(3);

COMMIT;
