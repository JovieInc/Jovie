DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_discovery_source') THEN
    CREATE TYPE "public"."lead_discovery_source" AS ENUM('google_cse', 'manual');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE "public"."lead_status" AS ENUM('discovered', 'qualified', 'disqualified', 'approved', 'ingested', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_channel') THEN
    CREATE TYPE "public"."outreach_channel" AS ENUM('instagram', 'twitter');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_status') THEN
    CREATE TYPE "public"."outreach_status" AS ENUM('pending', 'dm_generated', 'dm_sent', 'responded');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_audience_source') THEN
    CREATE TYPE "public"."tip_audience_source" AS ENUM('tip', 'link_click', 'save', 'manual');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_status') THEN
    CREATE TYPE "public"."tip_status" AS ENUM('pending', 'completed', 'failed', 'refunded');
  END IF;
END $$;--> statement-breakpoint
ALTER TYPE "public"."pixel_event_type" ADD VALUE IF NOT EXISTS 'tip_page_view';--> statement-breakpoint
ALTER TYPE "public"."pixel_event_type" ADD VALUE IF NOT EXISTS 'tip_intent';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovery_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"results_found_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"message" text NOT NULL,
	"source" text DEFAULT 'dashboard' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"user_id" uuid,
	"artist_id" uuid,
	"spotify_id" text,
	"handle" text,
	"action" text,
	"result" text,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_pipeline_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"discovery_enabled" boolean DEFAULT true NOT NULL,
	"auto_ingest_enabled" boolean DEFAULT false NOT NULL,
	"auto_ingest_min_fit_score" integer DEFAULT 60 NOT NULL,
	"auto_ingest_daily_limit" integer DEFAULT 10 NOT NULL,
	"auto_ingested_today" integer DEFAULT 0 NOT NULL,
	"auto_ingest_resets_at" timestamp,
	"daily_query_budget" integer DEFAULT 100 NOT NULL,
	"queries_used_today" integer DEFAULT 0 NOT NULL,
	"query_budget_resets_at" timestamp,
	"last_discovery_query_index" integer DEFAULT 0 NOT NULL,
	"dm_template" text DEFAULT 'Hey {displayName}! I found your Linktree and love your music on Spotify. I built Jovie to help artists like you create a better link-in-bio. Here''s your free page: {claimLink}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linktree_handle" text NOT NULL,
	"linktree_url" text NOT NULL,
	"discovery_source" "lead_discovery_source" NOT NULL,
	"discovery_query" text,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"contact_email" text,
	"has_paid_tier" boolean,
	"has_spotify_link" boolean DEFAULT false NOT NULL,
	"spotify_url" text,
	"has_instagram" boolean DEFAULT false NOT NULL,
	"instagram_handle" text,
	"music_tools_detected" text[] DEFAULT '{}' NOT NULL,
	"all_links" jsonb,
	"fit_score" integer,
	"fit_score_breakdown" jsonb,
	"status" "lead_status" DEFAULT 'discovered' NOT NULL,
	"disqualification_reason" text,
	"qualified_at" timestamp,
	"disqualified_at" timestamp,
	"approved_at" timestamp,
	"ingested_at" timestamp,
	"rejected_at" timestamp,
	"creator_profile_id" uuid,
	"scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_save_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"release_id" uuid NOT NULL,
	"track_id" uuid,
	"provider" text NOT NULL,
	"spotify_account_id" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"encrypted_apple_music_user_token" text,
	"fan_email" text,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tip_audience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"source" "tip_audience_source" DEFAULT 'tip' NOT NULL,
	"tip_amount_total_cents" integer DEFAULT 0 NOT NULL,
	"tip_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"gate_enabled" boolean DEFAULT true NOT NULL,
	"auto_accept_enabled" boolean DEFAULT false NOT NULL,
	"auto_accept_daily_limit" integer DEFAULT 0 NOT NULL,
	"auto_accepted_today" integer DEFAULT 0 NOT NULL,
	"auto_accept_resets_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_creator_profiles_spotify_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_creator_profiles_fit_score_unclaimed";--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "email_otp_hash" text;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "email_otp_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "email_otp_last_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "email_otp_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "tipper_name" text;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "status" "tip_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "platform_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD COLUMN IF NOT EXISTS "audio_url" text;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD COLUMN IF NOT EXISTS "audio_format" text;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "verification_token" text;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "verification_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "outreach_status" "outreach_status" DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "outreach_channel" "outreach_channel";--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "dm_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "dm_copy" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "outreach_priority" integer;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_items_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "leads" ADD CONSTRAINT "leads_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pre_save_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pre_save_tokens_release_id_discog_releases_id_fk'
  ) THEN
    ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pre_save_tokens_track_id_discog_tracks_id_fk'
  ) THEN
    ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tip_audience_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "tip_audience" ADD CONSTRAINT "tip_audience_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_discovery_keywords_query" ON "discovery_keywords" USING btree ("query");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_status_created_idx" ON "feedback_items" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_user_idx" ON "feedback_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_type" ON "ingest_audit_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_user_id" ON "ingest_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_created_at" ON "ingest_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_result" ON "ingest_audit_logs" USING btree ("result");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_linktree_handle" ON "leads" USING btree ("linktree_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_status_fit_score" ON "leads" USING btree ("status","fit_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_creator_profile_id" ON "leads" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_user_id_idx" ON "pre_save_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_track_id_idx" ON "pre_save_tokens" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_release_id_idx" ON "pre_save_tokens" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_provider_idx" ON "pre_save_tokens" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_executed_at_idx" ON "pre_save_tokens" USING btree ("executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pre_save_tokens_spotify_unique_idx" ON "pre_save_tokens" USING btree ("release_id","provider","spotify_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tip_audience_profile_id_email_unique" ON "tip_audience" USING btree ("profile_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_last_seen_at_idx" ON "tip_audience" USING btree ("profile_id","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_created_at_idx" ON "tip_audience" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_email_idx" ON "tip_audience" USING btree ("email") WHERE unsubscribed = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_members_creator_profile_id_type_last_seen_at_idx" ON "audience_members" USING btree ("creator_profile_id","type","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_link_id" ON "click_events" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_audience_member_id" ON "click_events" USING btree ("audience_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tips_stripe_checkout_session_id_unique" ON "tips" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_message_id" ON "chat_audit_log" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_generation_run_id" ON "ai_insights" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wrapped_links_created_by" ON "wrapped_links" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_contact_id" ON "creator_claim_invites" USING btree ("creator_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_id_created_at" ON "creator_profiles" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_outreach_status" ON "creator_profiles" USING btree ("is_claimed","outreach_status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_user_id" ON "profile_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_creator_profile_id" ON "profile_photos" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_ingestion_owner" ON "profile_photos" USING btree ("ingestion_owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_fit_score_unclaimed" ON "creator_profiles" USING btree ("fit_score","id") WHERE is_claimed = false;
