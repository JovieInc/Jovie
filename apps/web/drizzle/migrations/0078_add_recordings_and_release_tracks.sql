-- Migration: Add discog_recordings and discog_release_tracks tables
-- This introduces the MusicBrainz-inspired recording/release-track split.
-- discog_recordings = canonical audio entity (ISRC, duration, lyrics, audio)
-- discog_release_tracks = a recording's appearance on a specific release

-- Step 1: Extend enums
-- NOTE: ALTER TYPE ADD VALUE cannot be used in same transaction as CHECK constraints
-- referencing the new value. CHECK constraints are deferred to migration 0079.
ALTER TYPE "provider_link_owner_type" ADD VALUE IF NOT EXISTS 'release_track';
ALTER TYPE "content_slug_type" ADD VALUE IF NOT EXISTS 'release_track';

-- Step 2: Create discog_recordings table
CREATE TABLE IF NOT EXISTS "discog_recordings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "isrc" text,
  "duration_ms" integer,
  "is_explicit" boolean NOT NULL DEFAULT false,
  "preview_url" text,
  "audio_url" text,
  "audio_format" text,
  "lyrics" text,
  "source_type" "ingestion_source_type" NOT NULL DEFAULT 'manual',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "discog_recordings_creator_slug_unique"
  ON "discog_recordings" ("creator_profile_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "discog_recordings_creator_isrc_unique"
  ON "discog_recordings" ("creator_profile_id", "isrc")
  WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS "discog_recordings_creator_profile_id_idx"
  ON "discog_recordings" ("creator_profile_id");

-- Step 3: Create discog_release_tracks table
CREATE TABLE IF NOT EXISTS "discog_release_tracks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "release_id" uuid NOT NULL REFERENCES "discog_releases"("id") ON DELETE CASCADE,
  "recording_id" uuid NOT NULL REFERENCES "discog_recordings"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "track_number" integer NOT NULL,
  "disc_number" integer NOT NULL DEFAULT 1,
  "is_explicit" boolean NOT NULL DEFAULT false,
  "source_type" "ingestion_source_type" NOT NULL DEFAULT 'manual',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "discog_release_tracks_position_unique"
  ON "discog_release_tracks" ("release_id", "disc_number", "track_number");
CREATE UNIQUE INDEX IF NOT EXISTS "discog_release_tracks_release_slug_unique"
  ON "discog_release_tracks" ("release_id", "slug");
CREATE INDEX IF NOT EXISTS "discog_release_tracks_release_id_idx"
  ON "discog_release_tracks" ("release_id");
CREATE INDEX IF NOT EXISTS "discog_release_tracks_recording_id_idx"
  ON "discog_release_tracks" ("recording_id");

-- Step 4: Create recording_artists table
CREATE TABLE IF NOT EXISTS "recording_artists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recording_id" uuid NOT NULL REFERENCES "discog_recordings"("id") ON DELETE CASCADE,
  "artist_id" uuid NOT NULL REFERENCES "artists"("id") ON DELETE CASCADE,
  "role" "artist_role" NOT NULL,
  "credit_name" text,
  "join_phrase" text,
  "position" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "source_type" "ingestion_source_type" DEFAULT 'ingested',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "recording_artists_recording_artist_role"
  ON "recording_artists" ("recording_id", "artist_id", "role");
CREATE INDEX IF NOT EXISTS "recording_artists_artist_id_idx"
  ON "recording_artists" ("artist_id");
CREATE INDEX IF NOT EXISTS "recording_artists_recording_id_idx"
  ON "recording_artists" ("recording_id");

-- Step 5: Add release_track_id to provider_links
ALTER TABLE "provider_links"
  ADD COLUMN IF NOT EXISTS "release_track_id" uuid
  REFERENCES "discog_release_tracks"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_release_track_provider"
  ON "provider_links" ("provider_id", "release_track_id");
CREATE INDEX IF NOT EXISTS "provider_links_release_track_id_idx"
  ON "provider_links" ("release_track_id");

-- NOTE: CHECK constraint update deferred to migration 0079 (needs enum committed first)

-- Step 6: Add release_track_id to smart_link_targets
ALTER TABLE "smart_link_targets"
  ADD COLUMN IF NOT EXISTS "release_track_id" uuid
  REFERENCES "discog_release_tracks"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "smart_link_targets_release_track_id_idx"
  ON "smart_link_targets" ("release_track_id");

-- NOTE: CHECK constraint update deferred to migration 0079

-- Step 7: Add release_track_id to content_slug_redirects
ALTER TABLE "content_slug_redirects"
  ADD COLUMN IF NOT EXISTS "release_track_id" uuid
  REFERENCES "discog_release_tracks"("id") ON DELETE CASCADE;

-- NOTE: CHECK constraint update deferred to migration 0079

-- Step 8: Add release_track_id to pre_save_tokens
ALTER TABLE "pre_save_tokens"
  ADD COLUMN IF NOT EXISTS "release_track_id" uuid
  REFERENCES "discog_release_tracks"("id") ON DELETE CASCADE;
