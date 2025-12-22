-- Billing Hardening Migration
-- Adds optimistic locking, event ordering, and audit logging for subscription management

-- Add billing version for optimistic locking (prevents concurrent webhook overwrites)
ALTER TABLE "users" ADD COLUMN "billing_version" integer DEFAULT 1 NOT NULL;

-- Add last billing event timestamp for event ordering (skip stale events)
ALTER TABLE "users" ADD COLUMN "last_billing_event_at" timestamp;

-- Create billing audit log table for tracking subscription state changes
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

-- Index for querying audit log by user
CREATE INDEX "billing_audit_log_user_id_idx" ON "billing_audit_log" ("user_id");

-- Index for querying audit log by stripe event
CREATE INDEX "billing_audit_log_stripe_event_id_idx" ON "billing_audit_log" ("stripe_event_id");

-- Index for querying audit log by time range
CREATE INDEX "billing_audit_log_created_at_idx" ON "billing_audit_log" ("created_at");

-- Index on users for billing reconciliation queries
CREATE INDEX "users_stripe_customer_id_idx" ON "users" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;

-- Add processed_at column to stripe_webhook_events for tracking when events were processed
ALTER TABLE "stripe_webhook_events" ADD COLUMN "processed_at" timestamp;

-- Add event timestamp from Stripe for ordering
ALTER TABLE "stripe_webhook_events" ADD COLUMN "stripe_created_at" timestamp;
