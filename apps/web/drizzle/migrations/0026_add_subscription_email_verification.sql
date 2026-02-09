-- Double opt-in email verification for notification subscriptions
-- Adds confirmed_at, confirmation_token, and confirmation_sent_at columns

ALTER TABLE "notification_subscriptions"
  ADD COLUMN "confirmed_at" timestamp,
  ADD COLUMN "confirmation_token" text,
  ADD COLUMN "confirmation_sent_at" timestamp;

-- Backfill: treat all existing subscriptions as confirmed (grandfathered)
UPDATE "notification_subscriptions"
  SET "confirmed_at" = "created_at"
  WHERE "confirmed_at" IS NULL;

-- Index for looking up subscriptions by confirmation token
CREATE INDEX IF NOT EXISTS "notification_subscriptions_confirmation_token_idx"
  ON "notification_subscriptions" ("confirmation_token")
  WHERE "confirmation_token" IS NOT NULL;
