-- Migration: Switch RLS policies to use app.user_id session variable
-- Purpose: Align database RLS with repository guardrails (current_setting('app.user_id', true))
-- Date: 2025-11-29
-- Note: We keep existing public-access policies; this migration only rewrites
--       policies that depend on the authenticated user context.

-- Ensure RLS is enabled on relevant tables (no-op if already enabled)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;

-- ========================================
-- USERS TABLE POLICIES (OWN DATA)
-- ========================================

DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (current_setting('app.user_id', true) = clerk_id);

DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users
  FOR INSERT
  WITH CHECK (current_setting('app.user_id', true) = clerk_id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (current_setting('app.user_id', true) = clerk_id);

-- ========================================
-- CREATOR_PROFILES TABLE POLICIES (OWN DATA)
-- ========================================

DROP POLICY IF EXISTS "creator_profiles_select_own" ON creator_profiles;
CREATE POLICY "creator_profiles_select_own" ON creator_profiles
  FOR SELECT
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

DROP POLICY IF EXISTS "creator_profiles_insert_own" ON creator_profiles;
CREATE POLICY "creator_profiles_insert_own" ON creator_profiles
  FOR INSERT
  WITH CHECK (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

DROP POLICY IF EXISTS "creator_profiles_update_own" ON creator_profiles;
CREATE POLICY "creator_profiles_update_own" ON creator_profiles
  FOR UPDATE
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

DROP POLICY IF EXISTS "creator_profiles_delete_own" ON creator_profiles;
CREATE POLICY "creator_profiles_delete_own" ON creator_profiles
  FOR DELETE
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = creator_profiles.user_id)
  );

-- Existing public profile policy (creator_profiles_select_public) remains unchanged

-- ========================================
-- USER_SETTINGS TABLE POLICIES (OWN DATA)
-- ========================================

DROP POLICY IF EXISTS "user_settings_select_own" ON user_settings;
CREATE POLICY "user_settings_select_own" ON user_settings
  FOR SELECT
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

DROP POLICY IF EXISTS "user_settings_insert_own" ON user_settings;
CREATE POLICY "user_settings_insert_own" ON user_settings
  FOR INSERT
  WITH CHECK (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

DROP POLICY IF EXISTS "user_settings_update_own" ON user_settings;
CREATE POLICY "user_settings_update_own" ON user_settings
  FOR UPDATE
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT clerk_id FROM users WHERE id = user_settings.user_id)
  );

-- ========================================
-- SOCIAL_LINKS TABLE POLICIES (OWN DATA)
-- ========================================

DROP POLICY IF EXISTS "social_links_select_own" ON social_links;
CREATE POLICY "social_links_select_own" ON social_links
  FOR SELECT
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

DROP POLICY IF EXISTS "social_links_insert_own" ON social_links;
CREATE POLICY "social_links_insert_own" ON social_links
  FOR INSERT
  WITH CHECK (
    current_setting('app.user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

DROP POLICY IF EXISTS "social_links_update_own" ON social_links;
CREATE POLICY "social_links_update_own" ON social_links
  FOR UPDATE
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

DROP POLICY IF EXISTS "social_links_delete_own" ON social_links;
CREATE POLICY "social_links_delete_own" ON social_links
  FOR DELETE
  USING (
    current_setting('app.user_id', true)::text =
    (SELECT u.clerk_id FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.id = social_links.creator_profile_id)
  );

-- Existing public social links policy (social_links_select_public) remains unchanged
