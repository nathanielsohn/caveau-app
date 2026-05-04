-- 0007: wine image upload (feature #18)
--
-- Adds `wines.image_key` to store the S3 object key for a member-uploaded
-- bottle photo. We persist the key (not the full URL) so the CDN domain
-- can be swapped without rewriting existing rows. The full public URL is
-- derived at read time via `getPublicUrl(imageKey)` in `src/lib/s3.ts`.
--
-- Nullable: existing wines have no uploaded photo and continue to render
-- the placeholder bottle silhouette in `wine-card.tsx`.
--
-- Note: the legacy `image_url` column from 0001_init.sql is left in place
-- (still nullable) and unused by the upload flow. It is retained for any
-- ad-hoc seed data that may already populate it.
BEGIN;

ALTER TABLE "wines"
  ADD COLUMN "image_key" TEXT;

COMMIT;
