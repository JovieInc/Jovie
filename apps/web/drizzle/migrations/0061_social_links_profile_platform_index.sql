-- Optimize profile social-link sync lookups by canonical platform.
-- Supports: WHERE creator_profile_id = ? AND platform IN (...)
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_platform_idx"
  ON "social_links" (creator_profile_id, platform);
