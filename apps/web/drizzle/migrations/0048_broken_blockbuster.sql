-- JOV-2229: AI Connector v1 schema
-- 8 new tables and 7 new enums powering the Gmail booking email → Google Calendar magic moment.
-- All CREATE TYPE wrapped in idempotent DO blocks; all indexes use IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_run_status') THEN
    CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'waiting_for_approval', 'completed', 'failed');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_provider') THEN
    CREATE TYPE "public"."connector_provider" AS ENUM('google_calendar', 'gmail');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_status') THEN
    CREATE TYPE "public"."connector_status" AS ENUM('connected', 'needs_reauth', 'error', 'disabled');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'context_fact_kind') THEN
    CREATE TYPE "public"."context_fact_kind" AS ENUM('event_signal', 'tour_date_known');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggested_action_status') THEN
    CREATE TYPE "public"."suggested_action_status" AS ENUM('pending', 'approved', 'executed', 'rejected', 'failed', 'expired');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_provider') THEN
    CREATE TYPE "public"."webhook_provider" AS ENUM('google_calendar_push', 'gmail_pubsub');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_run_status') THEN
    CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'waiting_for_approval', 'completed', 'failed');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_slug" text NOT NULL,
	"trigger_kind" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"input_context_digest" text NOT NULL,
	"model" text,
	"prompt" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_usage" jsonb,
	"cost" numeric(10, 4) DEFAULT '0',
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"provider" "connector_provider" NOT NULL,
	"status" "connector_status" DEFAULT 'connected' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"provider_account_id" text NOT NULL,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_dev_message" text,
	"last_error_user_message" text,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_account_id" uuid NOT NULL,
	"resource_kind" text NOT NULL,
	"sync_token" text,
	"history_id" text,
	"cursor" jsonb,
	"last_full_sync_at" timestamp with time zone,
	"last_incremental_sync_at" timestamp with time zone,
	"token_refresh_locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "context_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "context_fact_kind" NOT NULL,
	"source_object_id" uuid,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"confidence" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_account_id" uuid NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"etag" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggested_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"kind" text NOT NULL,
	"target_connector_account_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "suggested_action_status" DEFAULT 'pending' NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text,
	"idempotency_key" text NOT NULL,
	"side_effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "webhook_provider" NOT NULL,
	"provider_message_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"payload_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"current_step" text,
	"step_outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_states" ADD CONSTRAINT "connector_sync_states_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_facts" ADD CONSTRAINT "context_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_facts" ADD CONSTRAINT "context_facts_source_object_id_external_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."external_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_objects" ADD CONSTRAINT "external_objects_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_target_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("target_connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_user_slug_status_started_idx" ON "agent_runs" USING btree ("user_id","agent_slug","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_accounts_user_provider_account_uniq" ON "connector_accounts" USING btree ("user_id","provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_sync_states_account_kind_uniq" ON "connector_sync_states" USING btree ("connector_account_id","resource_kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_objects_account_kind_provider_uniq" ON "external_objects" USING btree ("connector_account_id","kind","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_objects_account_kind_fetched_idx" ON "external_objects" USING btree ("connector_account_id","kind","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggested_actions_user_status_created_idx" ON "suggested_actions" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_provider_message_uniq" ON "webhook_deliveries" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_status_run_at_idx" ON "workflow_runs" USING btree ("status","run_at");
