DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_role') THEN
    CREATE TYPE "public"."artist_role" AS ENUM('main_artist', 'featured_artist', 'remixer', 'producer', 'co_producer', 'composer', 'lyricist', 'arranger', 'conductor', 'vs', 'with', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_type') THEN
    CREATE TYPE "public"."artist_type" AS ENUM('person', 'group', 'orchestra', 'choir', 'character', 'other');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"sort_name" text,
	"disambiguation" text,
	"artist_type" "artist_type" DEFAULT 'person',
	"spotify_id" text,
	"apple_music_id" text,
	"musicbrainz_id" text,
	"deezer_id" text,
	"image_url" text,
	"is_auto_created" boolean DEFAULT false NOT NULL,
	"match_confidence" numeric(5, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" NOT NULL,
	"credit_name" text,
	"join_phrase" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'ingested',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" NOT NULL,
	"credit_name" text,
	"join_phrase" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'ingested',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'artists_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "artists" ADD CONSTRAINT "artists_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'release_artists_release_id_discog_releases_id_fk'
  ) THEN
    ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'release_artists_artist_id_artists_id_fk'
  ) THEN
    ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'track_artists_track_id_discog_tracks_id_fk'
  ) THEN
    ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'track_artists_artist_id_artists_id_fk'
  ) THEN
    ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_spotify_id_unique" ON "artists" USING btree ("spotify_id") WHERE spotify_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_apple_music_id_unique" ON "artists" USING btree ("apple_music_id") WHERE apple_music_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_musicbrainz_id_unique" ON "artists" USING btree ("musicbrainz_id") WHERE musicbrainz_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_deezer_id_unique" ON "artists" USING btree ("deezer_id") WHERE deezer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_name_normalized_idx" ON "artists" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_creator_profile_id_idx" ON "artists" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_artists_release_artist_role" ON "release_artists" USING btree ("release_id","artist_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_artist_id_idx" ON "release_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_release_id_idx" ON "release_artists" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_artists_track_artist_role" ON "track_artists" USING btree ("track_id","artist_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_artists_artist_id_idx" ON "track_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_artists_track_id_idx" ON "track_artists" USING btree ("track_id");
