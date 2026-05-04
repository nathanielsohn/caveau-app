-- 0032: founding member pricing (feature #54)
--
-- Two concerns in one migration:
--
-- 1. Add the `reserve` value to the Tier enum. Reserve was previously
--    sales-gated (dbTier: null in src/lib/tiers.ts) because there was no
--    DB mapping for it. Pitch deck slide 8 confirms Reserve is $149/mo
--    self-serve, so we give it a first-class enum value and the wizard
--    can offer it as a selectable tier.
--
-- 2. Add founding-member flag + locked-at timestamp to members. The
--    founding price itself is NOT stored on the row — it's always
--    derivable from (tier, founding_member) via the tier spec in
--    src/lib/tiers.ts. The flag persists past the Q3 2027 founding
--    window so the locked rate survives, which is the whole point of
--    "price locked for life".
--
-- ALTER TYPE ... ADD VALUE is transaction-safe in PG 12+ as long as the
-- new value isn't referenced in the same transaction; the column adds
-- below use the default `false` / NULL so they never touch the enum.

BEGIN;

ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'reserve';

ALTER TABLE "members"
  ADD COLUMN "founding_member" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "founding_locked_at" TIMESTAMP(3);

COMMIT;
