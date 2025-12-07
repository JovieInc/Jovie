CREATE TYPE "public"."audience_device_type" AS ENUM('mobile', 'desktop', 'tablet', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."audience_intent_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."audience_member_type" AS ENUM('anonymous', 'email', 'sms', 'spotify', 'customer');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."contact_role" AS ENUM('bookings', 'management', 'press_pr', 'brand_partnerships', 'fan_general', 'other');--> statement-breakpoint
CREATE TYPE "public"."creator_type" AS ENUM('artist', 'podcaster', 'influencer', 'creator');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK');--> statement-breakpoint
CREATE TYPE "public"."ingestion_job_status" AS ENUM('pending', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ingestion_source_type" AS ENUM('manual', 'admin', 'ingested');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('idle', 'pending', 'processing', 'failed');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('listen', 'social', 'tip', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scraper_strategy" AS ENUM('http', 'browser', 'api');--> statement-breakpoint
CREATE TYPE "public"."social_account_status" AS ENUM('suspected', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."social_link_state" AS ENUM('active', 'suggested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'basic', 'premium', 'pro');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."theme_mode" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('new', 'invited', 'claimed', 'rejected');--> statement-breakpoint
CREATE TABLE "audience_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"type" "audience_member_type" DEFAULT 'anonymous' NOT NULL,
	"display_name" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"intent_level" "audience_intent_level" DEFAULT 'low' NOT NULL,
	"geo_city" text,
	"geo_country" text,
	"device_type" "audience_device_type" DEFAULT 'unknown' NOT NULL,
	"referrer_history" jsonb DEFAULT '[]'::jsonb,
	"latest_actions" jsonb DEFAULT '[]'::jsonb,
	"email" text,
	"phone" text,
	"spotify_connected" boolean DEFAULT false NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"fingerprint" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"link_id" uuid,
	"link_type" "link_type" NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "creator_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"role" "contact_role" NOT NULL,
	"custom_label" text,
	"person_name" text,
	"company_name" text,
	"territories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text,
	"phone" text,
	"preferred_channel" "contact_channel",
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"creator_type" "creator_type" NOT NULL,
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
	"claim_token_expires_at" timestamp,
	"claimed_from_ip" text,
	"claimed_user_agent" text,
	"avatar_locked_by_user" boolean DEFAULT false NOT NULL,
	"display_name_locked" boolean DEFAULT false NOT NULL,
	"ingestion_status" "ingestion_status" DEFAULT 'idle' NOT NULL,
	"last_ingestion_error" text,
	"last_login_at" timestamp,
	"profile_views" integer DEFAULT 0,
	"onboarding_completed_at" timestamp,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"theme" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "ingestion_job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp,
	"dedup_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"email" text,
	"phone" text,
	"country_code" text,
	"ip_address" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"ingestion_owner_user_id" uuid,
	"status" "photo_status" DEFAULT 'uploading' NOT NULL,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "scraper_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"strategy" "scraper_strategy" DEFAULT 'http' NOT NULL,
	"max_concurrency" integer DEFAULT 1 NOT NULL,
	"max_jobs_per_minute" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_link_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" text NOT NULL,
	"signed_token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_used" boolean DEFAULT false,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signed_link_access_signed_token_unique" UNIQUE("signed_token")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text,
	"url" text,
	"status" "social_account_status" DEFAULT 'suspected' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.00',
	"is_verified_flag" boolean DEFAULT false,
	"paid_flag" boolean DEFAULT false,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'ingested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_type" text NOT NULL,
	"url" text NOT NULL,
	"display_text" text,
	"sort_order" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"state" "social_link_state" DEFAULT 'active' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"stripe_object_id" text,
	"user_clerk_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"payment_intent_id" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"message" text,
	"is_anonymous" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tips_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme_mode" "theme_mode" DEFAULT 'system' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"is_pro" boolean DEFAULT false,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_updated_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"primary_social_url" text NOT NULL,
	"primary_social_platform" text NOT NULL,
	"primary_social_url_normalized" text NOT NULL,
	"spotify_url" text,
	"spotify_url_normalized" text,
	"heard_about" text,
	"status" "waitlist_status" DEFAULT 'new' NOT NULL,
	"primary_social_follower_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wrapped_links" (
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
	CONSTRAINT "wrapped_links_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_social_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."social_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contacts" ADD CONSTRAINT "creator_contacts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_ingestion_owner_user_id_users_id_fk" FOREIGN KEY ("ingestion_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;