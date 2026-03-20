-- Migration: Backfill recordings + add CHECK constraints referencing 'release_track' enum
-- The enum value was added in migration 0078 but PostgreSQL requires it to be committed
-- in a prior transaction before it can be referenced in CHECK constraints.

-- Step 0: Add CHECK constraints (deferred from 0078 due to enum transaction restriction)
ALTER TABLE "provider_links" DROP CONSTRAINT IF EXISTS "provider_links_owner_match";
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_owner_match" CHECK (
  (owner_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (owner_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (owner_type = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

ALTER TABLE "smart_link_targets" DROP CONSTRAINT IF EXISTS "smart_link_targets_owner_match";
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_owner_match" CHECK (
  (release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

ALTER TABLE "content_slug_redirects" DROP CONSTRAINT IF EXISTS "content_slug_redirects_content_match";
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_content_match" CHECK (
  (content_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (content_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (content_type = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

-- Step 1: Backfill discog_recordings from discog_tracks (1:1)
-- Strategy: Reuse discog_tracks.id as discog_recordings.id for easy FK migration.
-- Each track becomes exactly one recording (no ISRC dedup in backfill).
INSERT INTO "discog_recordings" (
  "id", "creator_profile_id", "title", "slug", "isrc", "duration_ms",
  "is_explicit", "preview_url", "audio_url", "audio_format", "lyrics",
  "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  "id", "creator_profile_id", "title", "slug", "isrc", "duration_ms",
  "is_explicit", "preview_url", "audio_url", "audio_format", "lyrics",
  "source_type", "metadata", "created_at", "updated_at"
FROM "discog_tracks"
ON CONFLICT ("id") DO NOTHING;

-- Step 2: Backfill discog_release_tracks from discog_tracks
INSERT INTO "discog_release_tracks" (
  "release_id", "recording_id", "title", "slug",
  "track_number", "disc_number", "is_explicit",
  "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  "release_id", "id", "title", "slug",
  "track_number", "disc_number", "is_explicit",
  "source_type", '{}'::jsonb, "created_at", "updated_at"
FROM "discog_tracks"
ON CONFLICT DO NOTHING;

-- Step 3: Migrate provider_links from track → release_track ownership
-- For each track-owned provider link, find the corresponding release_track
-- (matched via recording_id = old track_id and release_id from the original track)
UPDATE "provider_links" pl SET
  "owner_type" = 'release_track',
  "release_track_id" = rt."id",
  "track_id" = NULL
FROM "discog_release_tracks" rt
JOIN "discog_tracks" dt ON dt."id" = rt."recording_id" AND dt."release_id" = rt."release_id"
WHERE pl."owner_type" = 'track'
  AND pl."track_id" = dt."id";

-- Step 4: Backfill recording_artists from track_artists
INSERT INTO "recording_artists" (
  "recording_id", "artist_id", "role", "credit_name", "join_phrase",
  "position", "is_primary", "source_type", "metadata", "created_at"
)
SELECT
  "track_id", "artist_id", "role", "credit_name", "join_phrase",
  "position", "is_primary", "source_type", "metadata", "created_at"
FROM "track_artists"
ON CONFLICT DO NOTHING;
