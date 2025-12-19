CREATE TYPE "public"."discog_release_type" AS ENUM('single', 'ep', 'album', 'compilation', 'live', 'mixtape', 'other');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('music_streaming', 'video', 'social', 'retail', 'other');--> statement-breakpoint
CREATE TYPE "public"."provider_link_owner_type" AS ENUM('release', 'track');--> statement-breakpoint
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
CREATE UNIQUE INDEX "discog_releases_creator_slug_unique" ON "discog_releases" USING btree ("creator_profile_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "discog_releases_creator_upc_unique" ON "discog_releases" USING btree ("creator_profile_id","upc") WHERE upc IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discog_releases_release_date_idx" ON "discog_releases" USING btree ("release_date");--> statement-breakpoint
CREATE UNIQUE INDEX "discog_tracks_release_track_position_unique" ON "discog_tracks" USING btree ("release_id","disc_number","track_number");--> statement-breakpoint
CREATE UNIQUE INDEX "discog_tracks_release_slug_unique" ON "discog_tracks" USING btree ("release_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "discog_tracks_isrc_unique" ON "discog_tracks" USING btree ("isrc") WHERE isrc IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discog_tracks_release_id_idx" ON "discog_tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "discog_tracks_creator_profile_id_idx" ON "discog_tracks" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_links_release_provider" ON "provider_links" USING btree ("provider_id","release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_links_track_provider" ON "provider_links" USING btree ("provider_id","track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_links_provider_external" ON "provider_links" USING btree ("provider_id","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "provider_links_release_id_idx" ON "provider_links" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "provider_links_track_id_idx" ON "provider_links" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "smart_link_targets_slug_provider" ON "smart_link_targets" USING btree ("creator_profile_id","smart_link_slug","provider_id");--> statement-breakpoint
CREATE INDEX "smart_link_targets_provider_link_idx" ON "smart_link_targets" USING btree ("provider_link_id");--> statement-breakpoint
CREATE INDEX "smart_link_targets_release_id_idx" ON "smart_link_targets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "smart_link_targets_track_id_idx" ON "smart_link_targets" USING btree ("track_id");