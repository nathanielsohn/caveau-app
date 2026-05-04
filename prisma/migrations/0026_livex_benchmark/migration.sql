-- 0026_livex_benchmark.sql
--
-- Liv-ex Fine Wine 100 index history for AI Advisor Q2 (feature #50).
-- The advisor needs a benchmark to compare the member's portfolio YTD
-- against; we don't have a live feed yet, so seed plausible monthly
-- values and swap for a sync job when the Liv-ex API contract lands.
BEGIN;

CREATE TABLE "livex_benchmark" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "date"        TIMESTAMP(3) NOT NULL,
  "index_value" DECIMAL(9, 2) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "livex_benchmark_date_key" ON "livex_benchmark" ("date");
CREATE INDEX "livex_benchmark_date_idx" ON "livex_benchmark" ("date" DESC);

COMMIT;
