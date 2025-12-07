-- Add missing ip_address and source columns to notification_subscriptions
-- These columns were defined in the Drizzle schema but missing from the initial migration

ALTER TABLE "public"."notification_subscriptions" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "public"."notification_subscriptions" ADD COLUMN IF NOT EXISTS "source" text;
