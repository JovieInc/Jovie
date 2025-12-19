CREATE TABLE "spotify_discography_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"spotify_id" text NOT NULL,
	"spotify_url" text,
	"name" text NOT NULL,
	"album_type" text NOT NULL,
	"release_date" text,
	"release_date_precision" text,
	"total_tracks" integer,
	"upc" text,
	"image_url" text,
	"artists" jsonb DEFAULT '[]'::jsonb,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_discography_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"spotify_id" text NOT NULL,
	"spotify_url" text,
	"name" text NOT NULL,
	"duration_ms" integer,
	"track_number" integer,
	"disc_number" integer,
	"explicit" boolean DEFAULT false NOT NULL,
	"isrc" text,
	"preview_url" text,
	"artists" jsonb DEFAULT '[]'::jsonb,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotify_discography_releases" ADD CONSTRAINT "spotify_discography_releases_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_discography_tracks" ADD CONSTRAINT "spotify_discography_tracks_release_id_spotify_discography_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."spotify_discography_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_discography_tracks" ADD CONSTRAINT "spotify_discography_tracks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_spotify_discog_release_profile_spotify_id" ON "spotify_discography_releases" USING btree ("creator_profile_id","spotify_id");--> statement-breakpoint
CREATE INDEX "idx_spotify_discog_releases_profile_id" ON "spotify_discography_releases" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_spotify_discog_track_profile_spotify_id" ON "spotify_discography_tracks" USING btree ("creator_profile_id","spotify_id");--> statement-breakpoint
CREATE INDEX "idx_spotify_discog_tracks_release_id" ON "spotify_discography_tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "idx_spotify_discog_tracks_profile_id" ON "spotify_discography_tracks" USING btree ("creator_profile_id");