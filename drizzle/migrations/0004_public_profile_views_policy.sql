-- Migration: Allow public profile view increments under RLS
-- Purpose: Enable anonymous increments of creator_profiles.profile_views for public profiles
-- Date: 2025-11-24
-- Notes: This is specifically for analytics on public profile pages like /[username]

-- Allow updates to public profiles for the purpose of incrementing profile_views
CREATE POLICY "creator_profiles_update_public_views" ON creator_profiles
  FOR UPDATE
  USING (is_public = true)
  WITH CHECK (is_public = true);
