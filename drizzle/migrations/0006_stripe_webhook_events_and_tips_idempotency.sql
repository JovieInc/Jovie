-- Migration: Stripe webhook events + tips idempotency
-- Purpose: Add audit table for Stripe webhook events and enforce
--          one tip record per Stripe PaymentIntent.
-- Date: 2025-11-29

-- Create stripe_webhook_events table for webhook auditing and idempotency
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_event_id" text NOT NULL,
  "type" text NOT NULL,
  "stripe_object_id" text,
  "user_clerk_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE ("stripe_event_id")
);

-- Enforce a single tip record per Stripe PaymentIntent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'tips'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'tips_payment_intent_id_unique'
  ) THEN
    ALTER TABLE "tips"
      ADD CONSTRAINT "tips_payment_intent_id_unique" UNIQUE ("payment_intent_id");
  END IF;
END $$;
