-- 0043: mobile push tokens (feature #29)
--
-- Stores Expo push tokens for the React Native companion app so the alert
-- notification pipeline can fan out push notifications when configured.

BEGIN;

CREATE TABLE "mobile_push_tokens" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "expo_push_token" TEXT NOT NULL,
  "platform" TEXT,
  "device_name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_push_tokens_expo_push_token_key"
  ON "mobile_push_tokens" ("expo_push_token");

CREATE INDEX "mobile_push_tokens_member_id_active_idx"
  ON "mobile_push_tokens" ("member_id", "active");

ALTER TABLE "mobile_push_tokens"
  ADD CONSTRAINT "mobile_push_tokens_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

