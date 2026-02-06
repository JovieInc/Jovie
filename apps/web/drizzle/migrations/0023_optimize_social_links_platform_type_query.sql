-- Optimize Social Links Platform Type Query
-- Addresses query timeout in dashboard music links count query
-- Creates index to support efficient filtering by creator_profile_id, state, and platform_type

-- Index for platform_type filtering in dashboard queries
-- Supports: WHERE creator_profile_id = X AND state = 'active' AND platform_type = 'dsp'
CREATE INDEX IF NOT EXISTS "idx_social_links_platform_type"
  ON "social_links" (creator_profile_id, state, platform_type);