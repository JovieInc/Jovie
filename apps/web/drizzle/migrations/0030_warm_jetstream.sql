-- Migration: Creator Claim Invites, Billing Audit, Dashboard Idempotency
-- Purpose: Add claim invite system, billing audit log, and dashboard idempotency keys
-- Made idempotent to handle potential overlap with migration 0029

-- 1. Create claim_invite_status enum (idempotent with DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_invite_status') THEN
    CREATE TYPE "public"."claim_invite_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'bounced', 'failed', 'unsubscribed');
  END IF;
END $$;
--> statement-breakpoint

-- 2. Create user_status enum (idempotent with DO block - may already exist from migration 0029)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'banned');
  END IF;
END $$;
--> statement-breakpoint

-- 3. Create admin_audit_log table (idempotent - may already exist from migration 0029)
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 4. Create billing_audit_log table (idempotent)
CREATE TABLE IF NOT EXISTS "billing_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"previous_state" jsonb DEFAULT '{}'::jsonb,
	"new_state" jsonb DEFAULT '{}'::jsonb,
	"stripe_event_id" text,
	"source" text DEFAULT 'webhook' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 5. Create dashboard_idempotency_keys table (idempotent)
CREATE TABLE IF NOT EXISTS "dashboard_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 6. Create creator_claim_invites table (idempotent)
CREATE TABLE IF NOT EXISTS "creator_claim_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"creator_contact_id" uuid,
	"email" text NOT NULL,
	"status" "claim_invite_status" DEFAULT 'pending' NOT NULL,
	"send_at" timestamp,
	"sent_at" timestamp,
	"error" text,
	"subject" text,
	"body" text,
	"ai_variant_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 7. Add columns to existing tables (idempotent with IF NOT EXISTS)
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN IF NOT EXISTS "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN IF NOT EXISTS "stripe_created_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_billing_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "waitlist_entry_id" uuid;--> statement-breakpoint

-- 8. Add foreign key constraints (idempotent with DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_audit_log_admin_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_users_id_fk"
      FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_audit_log_target_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_users_id_fk"
      FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'billing_audit_log_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'creator_claim_invites_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'creator_claim_invites_creator_contact_id_creator_contacts_id_fk'
  ) THEN
    ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_contact_id_creator_contacts_id_fk"
      FOREIGN KEY ("creator_contact_id") REFERENCES "public"."creator_contacts"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- 9. Create indexes (idempotent with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_admin_user_id" ON "admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target_user_id" ON "admin_audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_user_id_idx" ON "billing_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_stripe_event_id_idx" ON "billing_audit_log" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_created_at_idx" ON "billing_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_idempotency_keys_key_user_endpoint_unique" ON "dashboard_idempotency_keys" USING btree ("key","user_id","endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_idempotency_keys_expires_at_idx" ON "dashboard_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_creator_profile_id" ON "creator_claim_invites" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_status" ON "creator_claim_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_send_at" ON "creator_claim_invites" USING btree ("send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_username_normalized_unique" ON "creator_profiles" USING btree ("username_normalized") WHERE username_normalized IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_state_idx" ON "social_links" USING btree ("creator_profile_id","state","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_waitlist_entry_id" ON "users" USING btree ("waitlist_entry_id");
