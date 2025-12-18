CREATE TYPE "public"."provider_link_quality" AS ENUM('canonical_api', 'partner_feed', 'manual_override', 'derived_search');--> statement-breakpoint
CREATE TYPE "public"."smart_link_target_kind" AS ENUM('track', 'release', 'profile');--> statement-breakpoint
CREATE TABLE "discog_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"spotify_release_id" text NOT NULL,
	"title" text NOT NULL,
	"release_date" timestamp,
	"upc" text,
	"spotify_url" text,
	"image_url" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discog_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"spotify_track_id" text NOT NULL,
	"title" text NOT NULL,
	"isrc" text,
	"track_number" integer,
	"disc_number" integer,
	"duration_ms" integer,
	"spotify_url" text,
	"preview_url" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"url" text NOT NULL,
	"quality" "provider_link_quality" NOT NULL,
	"discovered_from" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_link_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "smart_link_target_kind" NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"default_provider_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invited_at" timestamp;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD CONSTRAINT "discog_releases_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_provider_key_providers_key_fk" FOREIGN KEY ("provider_key") REFERENCES "public"."providers"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_default_provider_key_providers_key_fk" FOREIGN KEY ("default_provider_key") REFERENCES "public"."providers"("key") ON DELETE set null ON UPDATE no action;