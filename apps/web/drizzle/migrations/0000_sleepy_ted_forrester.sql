DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_device_type') THEN
    CREATE TYPE "public"."audience_device_type" AS ENUM('mobile', 'desktop', 'tablet', 'unknown');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_intent_level') THEN
    CREATE TYPE "public"."audience_intent_level" AS ENUM('high', 'medium', 'low');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_member_type') THEN
    CREATE TYPE "public"."audience_member_type" AS ENUM('anonymous', 'email', 'sms', 'spotify', 'customer');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_invite_status') THEN
    CREATE TYPE "public"."claim_invite_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'bounced', 'failed', 'unsubscribed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE "public"."contact_channel" AS ENUM('email', 'phone');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_role') THEN
    CREATE TYPE "public"."contact_role" AS ENUM('bookings', 'management', 'press_pr', 'brand_partnerships', 'fan_general', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_type') THEN
    CREATE TYPE "public"."creator_type" AS ENUM('artist', 'podcaster', 'influencer', 'creator');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_code') THEN
    CREATE TYPE "public"."currency_code" AS ENUM('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discog_release_type') THEN
    CREATE TYPE "public"."discog_release_type" AS ENUM('single', 'ep', 'album', 'compilation', 'live', 'mixtape', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_match_status') THEN
    CREATE TYPE "public"."dsp_match_status" AS ENUM('suggested', 'confirmed', 'rejected', 'auto_confirmed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_job_status') THEN
    CREATE TYPE "public"."ingestion_job_status" AS ENUM('pending', 'processing', 'succeeded', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_source_type') THEN
    CREATE TYPE "public"."ingestion_source_type" AS ENUM('manual', 'admin', 'ingested');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
    CREATE TYPE "public"."ingestion_status" AS ENUM('idle', 'pending', 'processing', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_type') THEN
    CREATE TYPE "public"."link_type" AS ENUM('listen', 'social', 'tip', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'push');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_status') THEN
    CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'processing', 'ready', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_kind') THEN
    CREATE TYPE "public"."provider_kind" AS ENUM('music_streaming', 'video', 'social', 'retail', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_link_owner_type') THEN
    CREATE TYPE "public"."provider_link_owner_type" AS ENUM('release', 'track');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_notification_status') THEN
    CREATE TYPE "public"."release_notification_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_notification_type') THEN
    CREATE TYPE "public"."release_notification_type" AS ENUM('preview', 'release_day');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scraper_strategy') THEN
    CREATE TYPE "public"."scraper_strategy" AS ENUM('http', 'browser', 'api');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_account_status') THEN
    CREATE TYPE "public"."social_account_status" AS ENUM('suspected', 'confirmed', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_link_state') THEN
    CREATE TYPE "public"."social_link_state" AS ENUM('active', 'suggested', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_suggestion_status') THEN
    CREATE TYPE "public"."social_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'email_sent', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'basic', 'premium', 'pro');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_mode') THEN
    CREATE TYPE "public"."theme_mode" AS ENUM('system', 'light', 'dark');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_lifecycle') THEN
    CREATE TYPE "public"."user_status_lifecycle" AS ENUM('waitlist_pending', 'waitlist_approved', 'profile_claimed', 'onboarding_incomplete', 'active', 'suspended', 'banned');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_invite_status') THEN
    CREATE TYPE "public"."waitlist_invite_status" AS ENUM('pending', 'sending', 'sent', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE "public"."waitlist_status" AS ENUM('new', 'invited', 'claimed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
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
CREATE TABLE "notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"email" text,
	"phone" text,
	"country_code" text,
	"city" text,
	"ip_address" text,
	"source" text,
	"preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true}'::jsonb,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_subscriptions_contact_required" CHECK (email IS NOT NULL OR phone IS NOT NULL)
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
	"name" text,
	"email" text,
	"user_status" "user_status_lifecycle" NOT NULL,
	"waitlist_entry_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_pro" boolean DEFAULT false,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_updated_at" timestamp,
	"billing_version" integer DEFAULT 1 NOT NULL,
	"last_billing_event_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "billing_audit_log" (
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
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"stripe_object_id" text,
	"user_clerk_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"stripe_created_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "discog_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"release_type" "discog_release_type" DEFAULT 'single' NOT NULL,
	"release_date" timestamp,
	"label" text,
	"upc" text,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"artwork_url" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discog_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"duration_ms" integer,
	"track_number" integer NOT NULL,
	"disc_number" integer DEFAULT 1 NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"isrc" text,
	"preview_url" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"owner_type" "provider_link_owner_type" NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"external_id" text,
	"url" text NOT NULL,
	"country" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_links_owner_match" CHECK (
        (owner_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL)
        OR (owner_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"kind" "provider_kind" DEFAULT 'music_streaming' NOT NULL,
	"base_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_link_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"smart_link_slug" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_link_id" uuid,
	"release_id" uuid,
	"track_id" uuid,
	"url" text NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smart_link_targets_owner_match" CHECK (
        (release_id IS NOT NULL AND track_id IS NULL)
        OR (track_id IS NOT NULL AND release_id IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "dsp_artist_enrichment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_artist_id" text,
	"name" text,
	"bio" text,
	"genres" text[],
	"image_urls" jsonb,
	"follower_count" integer,
	"monthly_listeners" integer,
	"verified" boolean,
	"country" text,
	"hometown" text,
	"external_urls" jsonb,
	"mbid" text,
	"founding_date" text,
	"disbanded_date" text,
	"artist_type" text,
	"aliases" text[],
	"isnis" text[],
	"raw_response" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsp_artist_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_artist_id" text,
	"external_artist_name" text,
	"external_artist_url" text,
	"external_artist_image_url" text,
	"confidence_score" numeric(5, 4),
	"confidence_breakdown" jsonb,
	"matching_isrc_count" integer DEFAULT 0 NOT NULL,
	"matching_upc_count" integer DEFAULT 0 NOT NULL,
	"total_tracks_checked" integer DEFAULT 0 NOT NULL,
	"status" "dsp_match_status" DEFAULT 'suggested' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fan_release_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"notification_subscription_id" uuid NOT NULL,
	"notification_type" "release_notification_type" NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "release_notification_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error" text,
	"dedup_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_sync_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"last_full_sync_at" timestamp,
	"last_incremental_sync_at" timestamp,
	"next_scheduled_sync_at" timestamp,
	"total_releases_synced" integer DEFAULT 0 NOT NULL,
	"releases_with_matches" integer DEFAULT 0 NOT NULL,
	"last_new_release_found_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_link_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"source_artist_id" text,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"username" text,
	"confidence_score" numeric(5, 4) NOT NULL,
	"confidence_breakdown" jsonb,
	"status" "social_suggestion_status" DEFAULT 'pending' NOT NULL,
	"email_sent_at" timestamp,
	"responded_at" timestamp,
	"dedup_key" text NOT NULL,
	"expires_at" timestamp,
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
CREATE TABLE "dashboard_idempotency_keys" (
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
	"version" integer DEFAULT 1 NOT NULL,
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
CREATE TABLE "creator_claim_invites" (
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
	"waitlist_entry_id" uuid,
	"creator_type" "creator_type" NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"display_name" text,
	"bio" text,
	"venmo_handle" text,
	"avatar_url" text,
	"spotify_url" text,
	"apple_music_url" text,
	"youtube_url" text,
	"spotify_id" text,
	"apple_music_id" text,
	"youtube_music_id" text,
	"deezer_id" text,
	"tidal_id" text,
	"soundcloud_id" text,
	"musicbrainz_id" text,
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
	"notification_preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true,"dspMatchSuggested":true,"socialLinkSuggested":true,"enrichmentComplete":false,"newReleaseDetected":true}'::jsonb,
	"fit_score" integer,
	"fit_score_breakdown" jsonb,
	"fit_score_updated_at" timestamp,
	"genres" text[],
	"spotify_followers" integer,
	"spotify_popularity" integer,
	"ingestion_source_platform" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"primary_goal" text,
	"selected_plan" text,
	"status" "waitlist_status" DEFAULT 'new' NOT NULL,
	"primary_social_follower_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"claim_token" text NOT NULL,
	"status" "waitlist_invite_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_social_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."social_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD CONSTRAINT "discog_releases_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_provider_link_id_provider_links_id_fk" FOREIGN KEY ("provider_link_id") REFERENCES "public"."provider_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_artist_enrichment" ADD CONSTRAINT "dsp_artist_enrichment_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_artist_matches" ADD CONSTRAINT "dsp_artist_matches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_notification_subscription_id_notification_subscriptions_id_fk" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_sync_status" ADD CONSTRAINT "release_sync_status_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_link_suggestions" ADD CONSTRAINT "social_link_suggestions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_contact_id_creator_contacts_id_fk" FOREIGN KEY ("creator_contact_id") REFERENCES "public"."creator_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contacts" ADD CONSTRAINT "creator_contacts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_ingestion_owner_user_id_users_id_fk" FOREIGN KEY ("ingestion_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_admin_user_id" ON "admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target_user_id" ON "admin_audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_members_creator_profile_id_fingerprint_unique" ON "audience_members" USING btree ("creator_profile_id","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_events_creator_profile_id_created_at_idx" ON "click_events" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_events_creator_profile_id_is_bot_created_at_idx" ON "click_events" USING btree ("creator_profile_id","is_bot","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_creator_profile_id_email_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_creator_profile_id_phone_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tips_creator_profile_id_idx" ON "tips" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_user_status" ON "users" USING btree ("user_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_user_id_idx" ON "billing_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_stripe_event_id_idx" ON "billing_audit_log" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_created_at_idx" ON "billing_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_releases_creator_slug_unique" ON "discog_releases" USING btree ("creator_profile_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_releases_creator_upc_unique" ON "discog_releases" USING btree ("creator_profile_id","upc") WHERE upc IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_releases_release_date_idx" ON "discog_releases" USING btree ("release_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_track_position_unique" ON "discog_tracks" USING btree ("release_id","disc_number","track_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_slug_unique" ON "discog_tracks" USING btree ("release_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_isrc_unique" ON "discog_tracks" USING btree ("isrc") WHERE isrc IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_tracks_release_id_idx" ON "discog_tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_tracks_creator_profile_id_idx" ON "discog_tracks" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_release_provider" ON "provider_links" USING btree ("provider_id","release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_track_provider" ON "provider_links" USING btree ("provider_id","track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_provider_external" ON "provider_links" USING btree ("provider_id","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_links_release_id_idx" ON "provider_links" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_links_track_id_idx" ON "provider_links" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_link_targets_slug_provider" ON "smart_link_targets" USING btree ("creator_profile_id","smart_link_slug","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_provider_link_idx" ON "smart_link_targets" USING btree ("provider_link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_release_id_idx" ON "smart_link_targets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_track_id_idx" ON "smart_link_targets" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dsp_artist_enrichment_creator_provider_unique" ON "dsp_artist_enrichment" USING btree ("creator_profile_id","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_artist_enrichment_provider_idx" ON "dsp_artist_enrichment" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dsp_artist_matches_creator_provider_unique" ON "dsp_artist_matches" USING btree ("creator_profile_id","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_artist_matches_status_idx" ON "dsp_artist_matches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_artist_matches_confidence_idx" ON "dsp_artist_matches" USING btree ("confidence_score");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fan_release_notifications_dedup_key_unique" ON "fan_release_notifications" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_status_scheduled_idx" ON "fan_release_notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_release_idx" ON "fan_release_notifications" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_creator_idx" ON "fan_release_notifications" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_sync_status_creator_provider_unique" ON "release_sync_status" USING btree ("creator_profile_id","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_sync_status_next_sync_idx" ON "release_sync_status" USING btree ("next_scheduled_sync_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_sync_status_failures_idx" ON "release_sync_status" USING btree ("consecutive_failures");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_link_suggestions_dedup_key_unique" ON "social_link_suggestions" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_status_created_idx" ON "social_link_suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_creator_idx" ON "social_link_suggestions" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_expires_idx" ON "social_link_suggestions" USING btree ("expires_at") WHERE expires_at IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingestion_jobs_dedup_key_unique" ON "ingestion_jobs" USING btree ("dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingestion_jobs_status_run_at" ON "ingestion_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_idempotency_keys_key_user_endpoint_unique" ON "dashboard_idempotency_keys" USING btree ("key","user_id","endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_idempotency_keys_expires_at_idx" ON "dashboard_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_state_idx" ON "social_links" USING btree ("creator_profile_id","state","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_creator_profile_id" ON "creator_claim_invites" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_status" ON "creator_claim_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_send_at" ON "creator_claim_invites" USING btree ("send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_claim_invites_profile_email_unique" ON "creator_claim_invites" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_featured_with_name" ON "creator_profiles" USING btree ("is_public","is_featured","marketing_opt_out","display_name") WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_username_normalized_unique" ON "creator_profiles" USING btree ("username_normalized") WHERE username_normalized IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_profiles_one_claimed_per_user" ON "creator_profiles" USING btree ("user_id") WHERE is_claimed = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_fit_score_unclaimed" ON "creator_profiles" USING btree ("fit_score","is_claimed","created_at") WHERE is_claimed = false AND fit_score IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_invites_entry_id" ON "waitlist_invites" USING btree ("waitlist_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_invites_claim_token_unique" ON "waitlist_invites" USING btree ("claim_token");