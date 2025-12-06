-- Jovie Initial Schema Migration
-- Consolidated migration for all tables, enums, indexes, and RLS policies
-- Generated: 2025-12-06

--------------------------------------------------------------------------------
-- ENUMS
--------------------------------------------------------------------------------

CREATE TYPE "public"."creator_type" AS ENUM ('artist', 'podcaster', 'influencer', 'creator');
CREATE TYPE "public"."link_type" AS ENUM ('listen', 'social', 'tip', 'other');
CREATE TYPE "public"."subscription_plan" AS ENUM ('free', 'basic', 'premium', 'pro');
CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'inactive', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');
CREATE TYPE "public"."theme_mode" AS ENUM ('system', 'light', 'dark');
CREATE TYPE "public"."currency_code" AS ENUM ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK');
CREATE TYPE "public"."ingestion_status" AS ENUM ('idle', 'pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."ingestion_source_type" AS ENUM ('manual', 'ingested', 'spotify', 'apple_music', 'youtube', 'instagram', 'twitter', 'tiktok', 'other');
CREATE TYPE "public"."social_link_state" AS ENUM ('active', 'suggested', 'rejected');
CREATE TYPE "public"."social_account_status" AS ENUM ('suspected', 'verified', 'rejected');
CREATE TYPE "public"."contact_role" AS ENUM ('manager', 'agent', 'publicist', 'label', 'legal', 'booking', 'other');
CREATE TYPE "public"."contact_channel" AS ENUM ('email', 'phone');
CREATE TYPE "public"."ingestion_job_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."scraper_strategy" AS ENUM ('http', 'browser', 'api');
CREATE TYPE "public"."notification_channel" AS ENUM ('email', 'sms', 'push');
CREATE TYPE "public"."audience_member_type" AS ENUM ('anonymous', 'email', 'sms', 'spotify', 'customer');
CREATE TYPE "public"."audience_device_type" AS ENUM ('mobile', 'desktop', 'tablet', 'unknown');
CREATE TYPE "public"."audience_intent_level" AS ENUM ('high', 'medium', 'low');
CREATE TYPE "public"."photo_status" AS ENUM ('uploading', 'processing', 'ready', 'failed');

--------------------------------------------------------------------------------
-- TABLES
--------------------------------------------------------------------------------

-- Users table (core authentication)
CREATE TABLE "public"."users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_id" text NOT NULL,
  "email" text,
  "is_pro" boolean DEFAULT false,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "billing_updated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_clerk_id_unique" UNIQUE ("clerk_id"),
  CONSTRAINT "users_email_unique" UNIQUE ("email"),
  CONSTRAINT "users_stripe_customer_id_unique" UNIQUE ("stripe_customer_id"),
  CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE ("stripe_subscription_id")
);

-- User settings (theme preferences)
CREATE TABLE "public"."user_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "theme_mode" "public"."theme_mode" DEFAULT 'system' NOT NULL,
  "sidebar_collapsed" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Creator profiles (main profile data)
CREATE TABLE "public"."creator_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "creator_type" "public"."creator_type" NOT NULL,
  "username" text NOT NULL,
  "username_normalized" text NOT NULL,
  "display_name" text,
  "bio" text,
  "avatar_url" text,
  "spotify_url" text,
  "apple_music_url" text,
  "youtube_url" text,
  "spotify_id" text,
  "is_public" boolean DEFAULT true,
  "is_verified" boolean DEFAULT false,
  "is_featured" boolean DEFAULT false,
  "marketing_opt_out" boolean DEFAULT false,
  "is_claimed" boolean DEFAULT false,
  "claim_token" text,
  "claimed_at" timestamp,
  "avatar_locked_by_user" boolean DEFAULT false NOT NULL,
  "display_name_locked" boolean DEFAULT false NOT NULL,
  "ingestion_status" "public"."ingestion_status" DEFAULT 'idle' NOT NULL,
  "last_login_at" timestamp,
  "profile_views" integer DEFAULT 0,
  "onboarding_completed_at" timestamp,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "theme" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Social links (links displayed on profile)
CREATE TABLE "public"."social_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "platform_type" text NOT NULL,
  "url" text NOT NULL,
  "display_text" text,
  "sort_order" integer DEFAULT 0,
  "clicks" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "state" "public"."social_link_state" DEFAULT 'active' NOT NULL,
  "confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
  "source_platform" text,
  "source_type" "public"."ingestion_source_type" DEFAULT 'manual' NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Click events (analytics)
CREATE TABLE "public"."click_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "link_id" uuid,
  "link_type" "public"."link_type" NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "referrer" text,
  "country" text,
  "city" text,
  "device_type" text,
  "os" text,
  "browser" text,
  "is_bot" boolean DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "audience_member_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Tips (payments)
CREATE TABLE "public"."tips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" "public"."currency_code" DEFAULT 'USD' NOT NULL,
  "payment_intent_id" text NOT NULL,
  "contact_email" text,
  "contact_phone" text,
  "message" text,
  "is_anonymous" boolean DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "idempotency_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tips_idempotency_key_unique" UNIQUE ("idempotency_key")
);

-- Signed link access (secure link tracking)
CREATE TABLE "public"."signed_link_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" text NOT NULL,
  "signed_token" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "is_used" boolean DEFAULT false,
  "used_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "signed_link_access_signed_token_unique" UNIQUE ("signed_token")
);

-- Wrapped links (URL shortener)
CREATE TABLE "public"."wrapped_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "short_id" text NOT NULL,
  "encrypted_url" text NOT NULL,
  "kind" text NOT NULL,
  "domain" text NOT NULL,
  "category" text,
  "title_alias" text,
  "click_count" integer DEFAULT 0,
  "created_by" text,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wrapped_links_short_id_unique" UNIQUE ("short_id")
);

-- Stripe webhook events (idempotency)
CREATE TABLE "public"."stripe_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamp DEFAULT now() NOT NULL,
  "payload" jsonb,
  CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE ("stripe_event_id")
);

-- Profile photos (avatar uploads)
CREATE TABLE "public"."profile_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "ingestion_owner_user_id" uuid,
  "creator_profile_id" uuid,
  "status" "public"."photo_status" DEFAULT 'uploading' NOT NULL,
  "source_platform" text,
  "source_type" "public"."ingestion_source_type" DEFAULT 'manual' NOT NULL,
  "confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
  "locked_by_user" boolean DEFAULT false NOT NULL,
  "blob_url" text,
  "small_url" text,
  "medium_url" text,
  "large_url" text,
  "original_filename" text,
  "mime_type" text,
  "file_size" integer,
  "width" integer,
  "height" integer,
  "processed_at" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Social accounts (discovered accounts from ingestion)
CREATE TABLE "public"."social_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "handle" text,
  "url" text,
  "status" "public"."social_account_status" DEFAULT 'suspected' NOT NULL,
  "confidence" numeric(3, 2) DEFAULT '0.00',
  "is_verified_flag" boolean DEFAULT false,
  "paid_flag" boolean DEFAULT false,
  "raw_data" jsonb,
  "source_platform" text,
  "source_type" "public"."ingestion_source_type" DEFAULT 'ingested' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Ingestion jobs (background job queue)
CREATE TABLE "public"."ingestion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" "public"."ingestion_job_status" DEFAULT 'pending' NOT NULL,
  "error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "run_at" timestamp DEFAULT now() NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Scraper configs (per-network scraping settings)
CREATE TABLE "public"."scraper_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "network" text NOT NULL,
  "strategy" "public"."scraper_strategy" DEFAULT 'http' NOT NULL,
  "max_concurrency" integer DEFAULT 1 NOT NULL,
  "max_jobs_per_minute" integer DEFAULT 30 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Artist contacts (contact information for artists)
CREATE TABLE "public"."artist_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "role" "public"."contact_role" NOT NULL,
  "name" text,
  "company" text,
  "channel" "public"."contact_channel" NOT NULL,
  "value" text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "source_platform" text,
  "source_type" "public"."ingestion_source_type" DEFAULT 'manual' NOT NULL,
  "confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Notification subscriptions (fan notifications)
CREATE TABLE "public"."notification_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "channel" "public"."notification_channel" NOT NULL,
  "email" text,
  "phone" text,
  "country_code" text,
  "is_verified" boolean DEFAULT false NOT NULL,
  "verification_token" text,
  "verification_sent_at" timestamp,
  "verified_at" timestamp,
  "unsubscribed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "notification_subscriptions_verification_token_unique" UNIQUE ("verification_token")
);

-- Audience members (visitor tracking)
CREATE TABLE "public"."audience_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL,
  "type" "public"."audience_member_type" DEFAULT 'anonymous' NOT NULL,
  "display_name" text,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "visits" integer DEFAULT 0 NOT NULL,
  "engagement_score" integer DEFAULT 0 NOT NULL,
  "intent_level" "public"."audience_intent_level" DEFAULT 'low' NOT NULL,
  "geo_city" text,
  "geo_country" text,
  "device_type" "public"."audience_device_type" DEFAULT 'unknown' NOT NULL,
  "referrer_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "latest_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "email" text,
  "phone" text,
  "spotify_connected" boolean DEFAULT false NOT NULL,
  "purchase_count" integer DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fingerprint" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

--------------------------------------------------------------------------------
-- FOREIGN KEYS
--------------------------------------------------------------------------------

ALTER TABLE "public"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "public"."social_links" ADD CONSTRAINT "social_links_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."click_events" ADD CONSTRAINT "click_events_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."click_events" ADD CONSTRAINT "click_events_link_id_social_links_id_fk" 
  FOREIGN KEY ("link_id") REFERENCES "public"."social_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "public"."click_events" ADD CONSTRAINT "click_events_audience_member_id_audience_members_id_fk" 
  FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "public"."tips" ADD CONSTRAINT "tips_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."profile_photos" ADD CONSTRAINT "profile_photos_ingestion_owner_user_id_users_id_fk" 
  FOREIGN KEY ("ingestion_owner_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "public"."profile_photos" ADD CONSTRAINT "profile_photos_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."social_accounts" ADD CONSTRAINT "social_accounts_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."artist_contacts" ADD CONSTRAINT "artist_contacts_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."audience_members" ADD CONSTRAINT "audience_members_creator_profile_id_creator_profiles_id_fk" 
  FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

--------------------------------------------------------------------------------
-- INDEXES
--------------------------------------------------------------------------------

-- Creator profiles indexes
CREATE INDEX "idx_creator_profiles_username" ON "public"."creator_profiles" ("username");
CREATE INDEX "idx_creator_profiles_username_normalized" ON "public"."creator_profiles" ("username_normalized");
CREATE INDEX "idx_creator_profiles_user_id" ON "public"."creator_profiles" ("user_id");
CREATE INDEX "idx_creator_profiles_is_featured" ON "public"."creator_profiles" ("is_featured") WHERE "is_featured" = true;
CREATE INDEX "idx_creator_profiles_featured_composite" ON "public"."creator_profiles" ("is_featured", "is_public", "created_at" DESC) WHERE "is_featured" = true AND "is_public" = true;
CREATE INDEX "idx_creator_profiles_public_profile" ON "public"."creator_profiles" ("username_normalized", "is_public") WHERE "is_public" = true;

-- Social links indexes
CREATE INDEX "idx_social_links_creator_profile_id" ON "public"."social_links" ("creator_profile_id");
CREATE INDEX "idx_social_links_platform" ON "public"."social_links" ("platform");

-- Click events indexes
CREATE INDEX "idx_click_events_creator_profile_id" ON "public"."click_events" ("creator_profile_id");
CREATE INDEX "idx_click_events_created_at" ON "public"."click_events" ("created_at");
CREATE INDEX "idx_click_events_audience_member" ON "public"."click_events" ("audience_member_id");

-- Tips indexes
CREATE INDEX "idx_tips_creator_profile_id" ON "public"."tips" ("creator_profile_id");
CREATE INDEX "idx_tips_created_at" ON "public"."tips" ("created_at");

-- Notification subscriptions indexes
CREATE INDEX "idx_notification_subscriptions_creator_profile_id" ON "public"."notification_subscriptions" ("creator_profile_id");
CREATE INDEX "idx_notification_subscriptions_email" ON "public"."notification_subscriptions" ("email") WHERE "email" IS NOT NULL;
CREATE INDEX "idx_notification_subscriptions_phone" ON "public"."notification_subscriptions" ("phone") WHERE "phone" IS NOT NULL;

-- Audience members indexes
CREATE INDEX "idx_audience_members_creator_profile" ON "public"."audience_members" ("creator_profile_id");
CREATE INDEX "idx_audience_members_last_seen" ON "public"."audience_members" ("last_seen_at" DESC);
CREATE INDEX "idx_audience_members_visits" ON "public"."audience_members" ("visits" DESC);
CREATE INDEX "idx_audience_members_fingerprint" ON "public"."audience_members" ("fingerprint");
CREATE UNIQUE INDEX "uniq_audience_members_creator_fingerprint" ON "public"."audience_members" ("creator_profile_id", "fingerprint") WHERE "fingerprint" IS NOT NULL;

-- Ingestion jobs indexes
CREATE INDEX "idx_ingestion_jobs_status" ON "public"."ingestion_jobs" ("status");
CREATE INDEX "idx_ingestion_jobs_run_at" ON "public"."ingestion_jobs" ("run_at");

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."creator_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."click_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profile_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."artist_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audience_members" ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT
  USING ("clerk_id" = current_setting('app.user_id', true)::text);

CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT
  WITH CHECK ("clerk_id" = current_setting('app.user_id', true)::text);

CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE
  USING ("clerk_id" = current_setting('app.user_id', true)::text);

-- User settings policies
CREATE POLICY "user_settings_select_own" ON "public"."user_settings" FOR SELECT
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "user_settings_insert_own" ON "public"."user_settings" FOR INSERT
  WITH CHECK ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "user_settings_update_own" ON "public"."user_settings" FOR UPDATE
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

-- Creator profiles policies (public read, owner write)
CREATE POLICY "creator_profiles_select_public" ON "public"."creator_profiles" FOR SELECT
  USING ("is_public" = true OR "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "creator_profiles_insert_own" ON "public"."creator_profiles" FOR INSERT
  WITH CHECK ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "creator_profiles_update_own" ON "public"."creator_profiles" FOR UPDATE
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "creator_profiles_delete_own" ON "public"."creator_profiles" FOR DELETE
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

-- Social links policies (public read via profile, owner write)
CREATE POLICY "social_links_select_public" ON "public"."social_links" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "is_public" = true)
    OR "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_links_insert_own" ON "public"."social_links" FOR INSERT
  WITH CHECK ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_links_update_own" ON "public"."social_links" FOR UPDATE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_links_delete_own" ON "public"."social_links" FOR DELETE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

-- Click events policies (owner only)
CREATE POLICY "click_events_select_own" ON "public"."click_events" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "click_events_insert_public" ON "public"."click_events" FOR INSERT
  WITH CHECK (true);

-- Tips policies (owner read, public insert)
CREATE POLICY "tips_select_own" ON "public"."tips" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "tips_insert_public" ON "public"."tips" FOR INSERT
  WITH CHECK (true);

-- Profile photos policies
CREATE POLICY "profile_photos_select_own" ON "public"."profile_photos" FOR SELECT
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "profile_photos_insert_own" ON "public"."profile_photos" FOR INSERT
  WITH CHECK ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "profile_photos_update_own" ON "public"."profile_photos" FOR UPDATE
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

CREATE POLICY "profile_photos_delete_own" ON "public"."profile_photos" FOR DELETE
  USING ("user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text));

-- Social accounts policies
CREATE POLICY "social_accounts_select_own" ON "public"."social_accounts" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_accounts_insert_own" ON "public"."social_accounts" FOR INSERT
  WITH CHECK ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_accounts_update_own" ON "public"."social_accounts" FOR UPDATE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "social_accounts_delete_own" ON "public"."social_accounts" FOR DELETE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

-- Artist contacts policies
CREATE POLICY "artist_contacts_select_own" ON "public"."artist_contacts" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "artist_contacts_insert_own" ON "public"."artist_contacts" FOR INSERT
  WITH CHECK ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "artist_contacts_update_own" ON "public"."artist_contacts" FOR UPDATE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "artist_contacts_delete_own" ON "public"."artist_contacts" FOR DELETE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

-- Notification subscriptions policies (public insert, owner read)
CREATE POLICY "notification_subscriptions_select_own" ON "public"."notification_subscriptions" FOR SELECT
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

CREATE POLICY "notification_subscriptions_insert_public" ON "public"."notification_subscriptions" FOR INSERT
  WITH CHECK (true);

CREATE POLICY "notification_subscriptions_update_own" ON "public"."notification_subscriptions" FOR UPDATE
  USING ("creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)));

-- Audience members policies
CREATE POLICY "audience_members_select_own" ON "public"."audience_members" FOR SELECT
  USING (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY "audience_members_insert_own" ON "public"."audience_members" FOR INSERT
  WITH CHECK (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY "audience_members_update_own" ON "public"."audience_members" FOR UPDATE
  USING (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY "audience_members_delete_own" ON "public"."audience_members" FOR DELETE
  USING (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

--------------------------------------------------------------------------------
-- FUNCTIONS
--------------------------------------------------------------------------------

-- Onboarding function for atomic profile creation
CREATE OR REPLACE FUNCTION create_profile_with_user(
  p_clerk_user_id text,
  p_email text,
  p_username text,
  p_display_name text DEFAULT NULL,
  p_creator_type creator_type DEFAULT 'artist'
) RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
BEGIN
  -- Set the session user for RLS
  PERFORM set_config('app.user_id', p_clerk_user_id, true);

  -- Create or get user
  INSERT INTO users (clerk_id, email)
  VALUES (p_clerk_user_id, p_email)
  ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
  RETURNING id INTO v_user_id;

  -- Create profile
  INSERT INTO creator_profiles (
    user_id,
    creator_type,
    username,
    username_normalized,
    display_name,
    is_claimed,
    claimed_at,
    onboarding_completed_at
  ) VALUES (
    v_user_id,
    p_creator_type,
    p_username,
    lower(p_username),
    COALESCE(p_display_name, p_username),
    true,
    now(),
    now()
  )
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
