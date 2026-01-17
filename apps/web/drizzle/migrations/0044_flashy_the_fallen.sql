DO $$ BEGIN
  CREATE TYPE "public"."dsp_match_status" AS ENUM('suggested', 'confirmed', 'rejected', 'auto_confirmed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."release_notification_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."release_notification_type" AS ENUM('preview', 'release_day');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."social_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'email_sent', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dsp_artist_enrichment" (
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
CREATE TABLE IF NOT EXISTS "dsp_artist_matches" (
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
CREATE TABLE IF NOT EXISTS "fan_release_notifications" (
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
CREATE TABLE IF NOT EXISTS "release_sync_status" (
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
CREATE TABLE IF NOT EXISTS "social_link_suggestions" (
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
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "apple_music_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "youtube_music_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "deezer_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "tidal_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "soundcloud_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "musicbrainz_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true,"dspMatchSuggested":true,"socialLinkSuggested":true,"enrichmentComplete":false,"newReleaseDetected":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "dsp_artist_enrichment" ADD CONSTRAINT "dsp_artist_enrichment_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_artist_matches" ADD CONSTRAINT "dsp_artist_matches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_notification_subscription_id_notification_subscriptions_id_fk" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_sync_status" ADD CONSTRAINT "release_sync_status_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_link_suggestions" ADD CONSTRAINT "social_link_suggestions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "creator_claim_invites" DROP COLUMN IF EXISTS "expires_at";--> statement-breakpoint
ALTER TABLE "creator_claim_invites" DROP COLUMN IF EXISTS "bounce_count";--> statement-breakpoint
ALTER TABLE "creator_claim_invites" DROP COLUMN IF EXISTS "last_bounce_at";--> statement-breakpoint
ALTER TABLE "creator_claim_invites" DROP COLUMN IF EXISTS "bounce_reason";
