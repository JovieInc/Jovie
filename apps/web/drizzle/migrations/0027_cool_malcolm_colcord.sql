DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'playlist_status') THEN
    CREATE TYPE "public"."playlist_status" AS ENUM('draft', 'pending', 'approved', 'published', 'archived', 'rejected');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jovie_playlist_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"spotify_track_id" text,
	"youtube_video_id" text,
	"position" integer NOT NULL,
	"artist_name" text NOT NULL,
	"track_name" text NOT NULL,
	"spotify_artist_id" text,
	"jovie_profile_id" uuid,
	"is_jovie_artist" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jovie_playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spotify_playlist_id" text,
	"youtube_playlist_id" text,
	"curator_spotify_user_id" text,
	"curator_profile_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"theme" text,
	"genre_tags" text[] DEFAULT '{}',
	"mood_tags" text[] DEFAULT '{}',
	"track_count" integer DEFAULT 0 NOT NULL,
	"cover_image_url" text,
	"cover_image_full_url" text,
	"editorial_note" text,
	"llm_prompt" text,
	"llm_model" text,
	"status" "playlist_status" DEFAULT 'draft' NOT NULL,
	"status_changed_at" timestamp DEFAULT now() NOT NULL,
	"rejection_note" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jovie_playlists_spotify_playlist_id_unique" UNIQUE("spotify_playlist_id"),
	CONSTRAINT "jovie_playlists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "jovie_playlist_tracks" ADD CONSTRAINT "jovie_playlist_tracks_playlist_id_jovie_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."jovie_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jovie_playlist_tracks" ADD CONSTRAINT "jovie_playlist_tracks_jovie_profile_id_creator_profiles_id_fk" FOREIGN KEY ("jovie_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jovie_playlists" ADD CONSTRAINT "jovie_playlists_curator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("curator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlist_tracks_playlist_idx" ON "jovie_playlist_tracks" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlist_tracks_spotify_artist_idx" ON "jovie_playlist_tracks" USING btree ("spotify_artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jovie_playlists_slug_idx" ON "jovie_playlists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlists_status_idx" ON "jovie_playlists" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlists_published_at_idx" ON "jovie_playlists" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlists_genre_tags_idx" ON "jovie_playlists" USING gin ("genre_tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jovie_playlists_mood_tags_idx" ON "jovie_playlists" USING gin ("mood_tags");
