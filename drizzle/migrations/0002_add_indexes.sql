-- Migration: Add critical indexes for performance
-- Purpose: Add missing indexes on frequently queried fields
-- Date: 2025-10-27
-- See: MVP Launch Blocker Audit

-- Index on creator_profiles.username_normalized for public profile lookups (UNIQUE)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_profiles_username_normalized
  ON creator_profiles(username_normalized);

-- Index on creator_profiles.user_id for dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_profiles_user_id
  ON creator_profiles(user_id);

-- Index on creator_profiles.is_featured for homepage featured creators
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_profiles_is_featured
  ON creator_profiles(is_featured) WHERE is_featured = true;

-- Index on creator_profiles.is_public for public profile filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_profiles_is_public
  ON creator_profiles(is_public) WHERE is_public = true;

-- Index on social_links.creator_profile_id for profile link retrieval
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_links_creator_profile_id
  ON social_links(creator_profile_id);

-- Index on click_events.creator_profile_id for analytics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_creator_profile_id
  ON click_events(creator_profile_id);

-- Index on click_events.created_at for time-range analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_created_at
  ON click_events(created_at DESC);

-- Index on tips.creator_profile_id for revenue queries (when tips table exists)
-- Note: This will fail silently if tips table doesn't exist yet
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tips') THEN
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tips_creator_profile_id
      ON tips(creator_profile_id);
  END IF;
END $$;
