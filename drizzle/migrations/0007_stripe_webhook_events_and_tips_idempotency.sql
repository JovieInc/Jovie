-- Stripe Webhook Events Audit Table
-- Purpose: Track all incoming webhook events for idempotency and debugging
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"stripe_object_id" text,
	"user_clerk_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);

-- Indexes for webhook event queries
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_type"
  ON "stripe_webhook_events"("type");

CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_user_clerk_id"
  ON "stripe_webhook_events"("user_clerk_id")
  WHERE "user_clerk_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_created_at"
  ON "stripe_webhook_events"("created_at" DESC);

-- Tips Idempotency: Ensure one tip per PaymentIntent
ALTER TABLE "tips"
  ADD CONSTRAINT IF NOT EXISTS "tips_payment_intent_id_unique"
  UNIQUE("payment_intent_id");

-- Index for tip queries by creator profile
CREATE INDEX IF NOT EXISTS "idx_tips_creator_profile_id"
  ON "tips"("creator_profile_id");