-- Migration: Add fit scoring columns to creator_profiles
-- Purpose: Enable GTM prioritization by scoring creators on ICP fit

-- Add fit scoring columns
ALTER TABLE "creator_profiles" ADD COLUMN "fit_score" integer;
ALTER TABLE "creator_profiles" ADD COLUMN "fit_score_breakdown" jsonb;
ALTER TABLE "creator_profiles" ADD COLUMN "fit_score_updated_at" timestamp;

-- Add Spotify enrichment columns
ALTER TABLE "creator_profiles" ADD COLUMN "genres" text[];
ALTER TABLE "creator_profiles" ADD COLUMN "spotify_followers" integer;
ALTER TABLE "creator_profiles" ADD COLUMN "spotify_popularity" integer;

-- Track where the profile was ingested from (for link-in-bio detection)
ALTER TABLE "creator_profiles" ADD COLUMN "ingestion_source_platform" text;

-- Index for efficient sorting by fit score for unclaimed profiles
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_fit_score_unclaimed"
  ON "creator_profiles" ("fit_score", "is_claimed", "created_at")
  WHERE is_claimed = false AND fit_score IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN "creator_profiles"."fit_score" IS 'Composite ICP fit score (0-100) for GTM prioritization';
COMMENT ON COLUMN "creator_profiles"."fit_score_breakdown" IS 'JSON breakdown of individual scoring criteria';
COMMENT ON COLUMN "creator_profiles"."fit_score_updated_at" IS 'When fit score was last calculated';
COMMENT ON COLUMN "creator_profiles"."genres" IS 'Artist genres from Spotify API';
COMMENT ON COLUMN "creator_profiles"."spotify_followers" IS 'Spotify follower count for popularity signal';
COMMENT ON COLUMN "creator_profiles"."spotify_popularity" IS 'Spotify popularity score (0-100)';
COMMENT ON COLUMN "creator_profiles"."ingestion_source_platform" IS 'Platform the profile was ingested from (linktree, beacons, etc.)';
