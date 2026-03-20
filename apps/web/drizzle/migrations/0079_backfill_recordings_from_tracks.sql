-- Migration: Backfill recordings + add CHECK constraints referencing 'release_track' enum
-- The enum value was added in migration 0078 but PostgreSQL requires it to be committed
-- in a prior transaction before it can be referenced in CHECK constraints.

-- Step 0: Add CHECK constraints (deferred from 0078 due to enum transaction restriction)
ALTER TABLE "provider_links" DROP CONSTRAINT IF EXISTS "provider_links_owner_match";
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_owner_match" CHECK (
  (owner_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (owner_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (owner_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

ALTER TABLE "smart_link_targets" DROP CONSTRAINT IF EXISTS "smart_link_targets_owner_match";
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_owner_match" CHECK (
  (release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

ALTER TABLE "content_slug_redirects" DROP CONSTRAINT IF EXISTS "content_slug_redirects_content_match";
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_content_match" CHECK (
  (content_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
  OR (content_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
  OR (content_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
);

-- Step 1: Backfill discog_recordings from discog_tracks
-- Strategy: Reuse discog_tracks.id as discog_recordings.id for easy FK migration.
-- Dedup by (creator_profile_id, slug) to satisfy the unique constraint, keeping
-- the earliest track per slug. ISRC is also deduped to avoid violating the
-- discog_recordings_creator_isrc_unique partial index.
INSERT INTO "discog_recordings" (
  "id", "creator_profile_id", "title", "slug", "isrc", "duration_ms",
  "is_explicit", "preview_url", "audio_url", "audio_format", "lyrics",
  "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  "id", "creator_profile_id", "title", "slug",
  CASE
    WHEN isrc IS NULL THEN NULL
    WHEN isrc_rn = 1 THEN isrc
    ELSE NULL
  END AS "isrc",
  "duration_ms",
  "is_explicit", "preview_url", "audio_url", "audio_format", "lyrics",
  "source_type", "metadata", "created_at", "updated_at"
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY "creator_profile_id", "slug"
      ORDER BY "created_at" ASC
    ) AS slug_rn,
    ROW_NUMBER() OVER (
      PARTITION BY "creator_profile_id",
        CASE WHEN isrc IS NOT NULL THEN isrc ELSE id::text END
      ORDER BY "created_at" ASC
    ) AS isrc_rn
  FROM "discog_tracks"
) ranked
WHERE slug_rn = 1
ON CONFLICT ("id") DO NOTHING;

-- Step 2: Backfill discog_release_tracks from discog_tracks
-- Map each track to its canonical recording (earliest track per creator+slug).
-- Tracks that share a slug with an earlier track for the same creator point
-- to the canonical recording's id instead of their own.
INSERT INTO "discog_release_tracks" (
  "release_id", "recording_id", "title", "slug",
  "track_number", "disc_number", "is_explicit",
  "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  dt."release_id",
  COALESCE(canonical.id, dt."id") AS "recording_id",
  dt."title", dt."slug",
  dt."track_number", dt."disc_number", dt."is_explicit",
  dt."source_type", '{}'::jsonb, dt."created_at", dt."updated_at"
FROM "discog_tracks" dt
LEFT JOIN "discog_recordings" canonical
  ON canonical."creator_profile_id" = dt."creator_profile_id"
  AND canonical."slug" = dt."slug"
ON CONFLICT DO NOTHING;

-- Step 3: Migrate provider_links from track → release_track ownership
-- For each track-owned provider link, find the corresponding release_track
-- by matching the track's release_id and slug (since recording_id may differ
-- for duplicate-slug tracks that were merged into one canonical recording).
UPDATE "provider_links" pl SET
  "owner_type" = 'release_track',
  "release_track_id" = rt."id",
  "track_id" = NULL
FROM "discog_release_tracks" rt
JOIN "discog_tracks" dt ON dt."release_id" = rt."release_id" AND dt."slug" = rt."slug"
WHERE pl."owner_type" = 'track'
  AND pl."track_id" = dt."id";

-- Step 4: Backfill recording_artists from track_artists
-- Map track_id to the canonical recording via the discog_recordings table.
INSERT INTO "recording_artists" (
  "recording_id", "artist_id", "role", "credit_name", "join_phrase",
  "position", "is_primary", "source_type", "metadata", "created_at"
)
SELECT
  COALESCE(r."id", ta."track_id") AS "recording_id",
  ta."artist_id", ta."role", ta."credit_name", ta."join_phrase",
  ta."position", ta."is_primary", ta."source_type", ta."metadata", ta."created_at"
FROM "track_artists" ta
LEFT JOIN "discog_tracks" dt ON dt."id" = ta."track_id"
LEFT JOIN "discog_recordings" r ON r."creator_profile_id" = dt."creator_profile_id" AND r."slug" = dt."slug"
ON CONFLICT DO NOTHING;
