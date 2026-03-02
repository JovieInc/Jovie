-- Add tip_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_status') THEN
    CREATE TYPE "tip_status" AS ENUM ('pending', 'completed', 'failed', 'refunded');
  END IF;
END $$;

-- Add new columns to tips table for Stripe Checkout support
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "tipper_name" text;
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "status" "tip_status" DEFAULT 'pending' NOT NULL;
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "platform_fee_cents" integer;
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Backfill existing tips as completed (they went through payment_intent.succeeded)
UPDATE "tips" SET "status" = 'completed' WHERE "status" = 'pending';

-- Add unique index on checkout session ID
CREATE UNIQUE INDEX IF NOT EXISTS "tips_stripe_checkout_session_id_unique" ON "tips" ("stripe_checkout_session_id");
