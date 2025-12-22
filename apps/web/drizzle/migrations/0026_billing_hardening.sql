-- Billing Hardening Migration (Idempotent)
-- Adds optimistic locking, event ordering, and audit logging for subscription management

--------------------------------------------------------------------------------
-- ADD BILLING VERSION FOR OPTIMISTIC LOCKING
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'billing_version'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "billing_version" integer DEFAULT 1 NOT NULL;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- ADD LAST BILLING EVENT TIMESTAMP FOR EVENT ORDERING
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_billing_event_at'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "last_billing_event_at" timestamp;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- CREATE BILLING AUDIT LOG TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "billing_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "previous_state" jsonb DEFAULT '{}',
  "new_state" jsonb DEFAULT '{}',
  "stripe_event_id" text,
  "source" text NOT NULL DEFAULT 'webhook',
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);

--------------------------------------------------------------------------------
-- CREATE INDEXES (IF NOT EXISTS)
--------------------------------------------------------------------------------

-- Index for querying audit log by user
CREATE INDEX IF NOT EXISTS "billing_audit_log_user_id_idx" ON "billing_audit_log" ("user_id");

-- Index for querying audit log by stripe event
CREATE INDEX IF NOT EXISTS "billing_audit_log_stripe_event_id_idx" ON "billing_audit_log" ("stripe_event_id");

-- Index for querying audit log by time range
CREATE INDEX IF NOT EXISTS "billing_audit_log_created_at_idx" ON "billing_audit_log" ("created_at");

-- Index on users for billing reconciliation queries
CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx" ON "users" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;

--------------------------------------------------------------------------------
-- ADD COLUMNS TO STRIPE_WEBHOOK_EVENTS
--------------------------------------------------------------------------------

-- Add processed_at column for tracking when events were processed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stripe_webhook_events' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE "stripe_webhook_events" ADD COLUMN "processed_at" timestamp;
  END IF;
END $$;

-- Add event timestamp from Stripe for ordering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stripe_webhook_events' AND column_name = 'stripe_created_at'
  ) THEN
    ALTER TABLE "stripe_webhook_events" ADD COLUMN "stripe_created_at" timestamp;
  END IF;
END $$;
