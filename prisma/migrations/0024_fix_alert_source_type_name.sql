-- 0024_fix_alert_source_type_name.sql
--
-- Migration 0023 created the alert-source enum as "alert_source" but the
-- Prisma schema declares `enum AlertSource` with no @@map, so the client
-- generates queries against `public."AlertSource"`. That mismatch made
-- every SELECT that touches the enum column blow up with
--   type "public.AlertSource" does not exist
-- which took the Caveau Custody & Condition Report page down (and the
-- handoff bundle with it, since both go through buildProvenanceBundle).
--
-- Rename the existing type in place. ALTER TYPE ... RENAME TO updates
-- every referencing column's udt_name atomically, so no column touch-ups
-- or data migration are needed. Postgres renames the companion array
-- type ("_alert_source" → "_AlertSource") automatically.
--
-- This brings the enum in line with every other enum in schema.prisma
-- (Role, Tier, AlertType, NfcTagTier, etc.) which all live in the DB
-- under their PascalCase Prisma names.
BEGIN;

ALTER TYPE "alert_source" RENAME TO "AlertSource";

COMMIT;
