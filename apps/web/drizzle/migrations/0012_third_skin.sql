ALTER TABLE "dsp_artist_matches" ADD COLUMN "match_source" text;--> statement-breakpoint

-- Tag existing ISRC-discovered matches
UPDATE "dsp_artist_matches" SET "match_source" = 'isrc_discovery' WHERE "match_source" IS NULL;--> statement-breakpoint

-- Backfill: seed dsp_artist_matches from creator_profiles DSP columns.
-- Apple Music requires a real artist ID before we auto-confirm it because
-- downstream release enrichment validates external_artist_id as required.
WITH "normalized_profiles" AS (
  SELECT
    cp."id",
    cp."display_name",
    cp."spotify_id",
    cp."spotify_url",
    COALESCE(
      cp."apple_music_id",
      substring(cp."apple_music_url" from '.*/([0-9]+)(?:\\?.*)?$')
    ) AS "apple_music_external_id",
    cp."apple_music_url",
    cp."youtube_url",
    cp."youtube_music_id",
    cp."deezer_id",
    cp."tidal_id",
    cp."soundcloud_id"
  FROM "creator_profiles" cp
),
"backfill_rows" AS (
  SELECT
    np."id" AS "creator_profile_id",
    'spotify'::text AS "provider_id",
    np."spotify_id" AS "external_artist_id",
    np."display_name" AS "external_artist_name",
    COALESCE(np."spotify_url", 'https://open.spotify.com/artist/' || np."spotify_id") AS "external_artist_url"
  FROM "normalized_profiles" np
  WHERE np."spotify_id" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'apple_music',
    np."apple_music_external_id",
    np."display_name",
    COALESCE(
      np."apple_music_url",
      'https://music.apple.com/artist/' || np."apple_music_external_id"
    )
  FROM "normalized_profiles" np
  WHERE np."apple_music_external_id" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'youtube',
    NULL,
    np."display_name",
    np."youtube_url"
  FROM "normalized_profiles" np
  WHERE np."youtube_url" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'youtube_music',
    np."youtube_music_id",
    np."display_name",
    'https://music.youtube.com/channel/' || np."youtube_music_id"
  FROM "normalized_profiles" np
  WHERE np."youtube_music_id" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'deezer',
    np."deezer_id",
    np."display_name",
    'https://www.deezer.com/artist/' || np."deezer_id"
  FROM "normalized_profiles" np
  WHERE np."deezer_id" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'tidal',
    np."tidal_id",
    np."display_name",
    'https://tidal.com/browse/artist/' || np."tidal_id"
  FROM "normalized_profiles" np
  WHERE np."tidal_id" IS NOT NULL

  UNION ALL

  SELECT
    np."id",
    'soundcloud',
    np."soundcloud_id",
    np."display_name",
    'https://soundcloud.com/' || np."soundcloud_id"
  FROM "normalized_profiles" np
  WHERE np."soundcloud_id" IS NOT NULL
)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  br."creator_profile_id",
  br."provider_id",
  br."external_artist_id",
  br."external_artist_name",
  br."external_artist_url",
  1.0000,
  0,
  0,
  0,
  'auto_confirmed',
  NOW(),
  'backfill',
  NOW(),
  NOW()
FROM "backfill_rows" br
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;
