ALTER TABLE "dsp_artist_matches" ADD COLUMN "match_source" text;--> statement-breakpoint

-- Tag existing ISRC-discovered matches
UPDATE "dsp_artist_matches" SET "match_source" = 'isrc_discovery' WHERE "match_source" IS NULL;--> statement-breakpoint

-- Backfill: seed dsp_artist_matches from creator_profiles DSP columns.
-- One INSERT per DSP type for readability. ON CONFLICT DO NOTHING preserves existing ISRC matches.

-- Spotify (from spotify_url or spotify_id)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'spotify', cp."spotify_id", cp."display_name",
  COALESCE(cp."spotify_url", 'https://open.spotify.com/artist/' || cp."spotify_id"),
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."spotify_id" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;--> statement-breakpoint

-- Apple Music (from apple_music_url or apple_music_id)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'apple_music', cp."apple_music_id", cp."display_name",
  COALESCE(cp."apple_music_url", 'https://music.apple.com/artist/' || cp."apple_music_id"),
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."apple_music_id" IS NOT NULL OR cp."apple_music_url" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;--> statement-breakpoint

-- YouTube Music (from youtube_music_id)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'youtube_music', cp."youtube_music_id", cp."display_name",
  'https://music.youtube.com/channel/' || cp."youtube_music_id",
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."youtube_music_id" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;--> statement-breakpoint

-- Deezer (from deezer_id)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'deezer', cp."deezer_id", cp."display_name",
  'https://www.deezer.com/artist/' || cp."deezer_id",
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."deezer_id" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;--> statement-breakpoint

-- Tidal (from tidal_id)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'tidal', cp."tidal_id", cp."display_name",
  'https://tidal.com/browse/artist/' || cp."tidal_id",
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."tidal_id" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;--> statement-breakpoint

-- SoundCloud (from soundcloud_id — this is a slug, not numeric)
INSERT INTO "dsp_artist_matches" ("id", "creator_profile_id", "provider_id", "external_artist_id", "external_artist_name", "external_artist_url", "confidence_score", "matching_isrc_count", "matching_upc_count", "total_tracks_checked", "status", "confirmed_at", "match_source", "created_at", "updated_at")
SELECT gen_random_uuid(), cp."id", 'soundcloud', cp."soundcloud_id", cp."display_name",
  'https://soundcloud.com/' || cp."soundcloud_id",
  1.0000, 0, 0, 0, 'auto_confirmed', NOW(), 'backfill', NOW(), NOW()
FROM "creator_profiles" cp
WHERE cp."soundcloud_id" IS NOT NULL
ON CONFLICT ("creator_profile_id", "provider_id") DO NOTHING;
