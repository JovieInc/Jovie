-- Migration: Add Row-Level Security (RLS) policies
-- Purpose: Implement database-level access control using Clerk user IDs
-- Date: 2025-10-27
-- See: CLAUDE.md "🛡️ Postgres Security & RLS Pattern"

-- Enable RLS on tables containing user-specific data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;

-- ========================================
-- USERS TABLE POLICIES
-- ========================================

-- Users can view their own data
CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (current_setting('app.clerk_user_id', true) = clerk_id);

-- Users can insert their own data (during signup)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT
  WITH CHECK (current_setting('app.clerk_user_id', true) = clerk_id);

-- Users can update their own data
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (current_setting('app.clerk_user_id', true) = clerk_id);

-- ========================================
-- CREATOR_PROFILES TABLE POLICIES
-- ========================================

-- Users can view their own profiles
CREATE POLICY "creator_profiles_select_own" ON creator_profiles
  FOR SELECT
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

-- Public profiles are viewable by anyone (bypass RLS for public reads)
CREATE POLICY "creator_profiles_select_public" ON creator_profiles
  FOR SELECT
  USING (is_public = true);

-- Users can insert their own profiles
CREATE POLICY "creator_profiles_insert_own" ON creator_profiles
  FOR INSERT
  WITH CHECK (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

-- Users can update their own profiles
CREATE POLICY "creator_profiles_update_own" ON creator_profiles
  FOR UPDATE
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

-- Users can delete their own profiles
CREATE POLICY "creator_profiles_delete_own" ON creator_profiles
  FOR DELETE
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

-- ========================================
-- USER_SETTINGS TABLE POLICIES
-- ========================================

-- Users can view their own settings
CREATE POLICY "user_settings_select_own" ON user_settings
  FOR SELECT
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

-- Users can insert their own settings
CREATE POLICY "user_settings_insert_own" ON user_settings
  FOR INSERT
  WITH CHECK (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

-- Users can update their own settings
CREATE POLICY "user_settings_update_own" ON user_settings
  FOR UPDATE
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

-- ========================================
-- SOCIAL_LINKS TABLE POLICIES
-- ========================================

-- Users can view their own social links
CREATE POLICY "social_links_select_own" ON social_links
  FOR SELECT
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

-- Public social links are viewable by anyone (for public profiles)
CREATE POLICY "social_links_select_public" ON social_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creator_profiles
      WHERE id = social_links.creator_profile_id
      AND is_public = true
    )
  );

-- Users can insert their own social links
CREATE POLICY "social_links_insert_own" ON social_links
  FOR INSERT
  WITH CHECK (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

-- Users can update their own social links
CREATE POLICY "social_links_update_own" ON social_links
  FOR UPDATE
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

-- Users can delete their own social links
CREATE POLICY "social_links_delete_own" ON social_links
  FOR DELETE
  USING (
    current_setting('app.clerk_user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );
