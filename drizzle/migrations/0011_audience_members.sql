-- Migration: Add audience_members for anonymous+identified traffic
-- Date: 2025-12-03
-- Purpose: Capture every visitor as an audience profile that powers the dashboard table and activity feed

-- Enumerations for new audience layer
CREATE TYPE IF NOT EXISTS audience_member_type AS ENUM (
  'anonymous',
  'email',
  'sms',
  'spotify',
  'customer'
);

CREATE TYPE IF NOT EXISTS audience_device_type AS ENUM (
  'mobile',
  'desktop',
  'tablet',
  'unknown'
);

CREATE TYPE IF NOT EXISTS audience_intent_level AS ENUM (
  'high',
  'medium',
  'low'
);

-- Audience members table
CREATE TABLE IF NOT EXISTS audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id uuid NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  type audience_member_type NOT NULL DEFAULT 'anonymous',
  display_name text,
  first_seen_at timestamp NOT NULL DEFAULT NOW(),
  last_seen_at timestamp NOT NULL DEFAULT NOW(),
  visits integer NOT NULL DEFAULT 0,
  engagement_score integer NOT NULL DEFAULT 0,
  intent_level audience_intent_level NOT NULL DEFAULT 'low',
  geo_city text,
  geo_country text,
  device_type audience_device_type NOT NULL DEFAULT 'unknown',
  referrer_history jsonb NOT NULL DEFAULT '[]',
  latest_actions jsonb NOT NULL DEFAULT '[]',
  email text,
  phone text,
  spotify_connected boolean NOT NULL DEFAULT false,
  purchase_count integer NOT NULL DEFAULT 0,
  tags jsonb NOT NULL DEFAULT '[]',
  fingerprint text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audience_members_creator_profile ON audience_members(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_audience_members_last_seen ON audience_members(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_audience_members_visits ON audience_members(visits DESC);
CREATE INDEX IF NOT EXISTS idx_audience_members_fingerprint ON audience_members(fingerprint);

-- Expose clicks back to the new audience row
ALTER TABLE click_events
  ADD COLUMN IF NOT EXISTS audience_member_id uuid REFERENCES audience_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_click_events_audience_member ON click_events(audience_member_id);

-- Seed audience members from existing notification subscriptions (identified traffic)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'notification_subscriptions'
  ) THEN
    INSERT INTO audience_members (
      creator_profile_id,
      type,
      display_name,
      first_seen_at,
      last_seen_at,
      visits,
      engagement_score,
      intent_level,
      geo_country,
      email,
      phone,
      fingerprint,
      created_at,
      updated_at
    )
    SELECT
      creator_profile_id,
      CASE
        WHEN channel = 'email' THEN 'email'::audience_member_type
        WHEN channel = 'phone' THEN 'sms'::audience_member_type
        ELSE 'anonymous'
      END,
      COALESCE(email, phone),
      created_at,
      created_at,
      1,
      1,
      'medium',
      country_code,
      email,
      phone,
      NULL,
      created_at,
      created_at
    FROM notification_subscriptions;
  END IF;
END $$;

-- Row Level Security for the new table
ALTER TABLE audience_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY audience_members_select_owner ON audience_members
  FOR SELECT
  USING (
    (
      SELECT clerk_id
      FROM users
      JOIN creator_profiles ON creator_profiles.user_id = users.id
      WHERE creator_profiles.id = audience_members.creator_profile_id
    ) = current_setting('app.user_id', true)::text
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY audience_members_insert_owner ON audience_members
  FOR INSERT
  WITH CHECK (
    (
      SELECT clerk_id
      FROM users
      JOIN creator_profiles ON creator_profiles.user_id = users.id
      WHERE creator_profiles.id = audience_members.creator_profile_id
    ) = current_setting('app.user_id', true)::text
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY audience_members_update_owner ON audience_members
  FOR UPDATE
  USING (
    (
      SELECT clerk_id
      FROM users
      JOIN creator_profiles ON creator_profiles.user_id = users.id
      WHERE creator_profiles.id = audience_members.creator_profile_id
    ) = current_setting('app.user_id', true)::text
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

CREATE POLICY audience_members_delete_owner ON audience_members
  FOR DELETE
  USING (
    (
      SELECT clerk_id
      FROM users
      JOIN creator_profiles ON creator_profiles.user_id = users.id
      WHERE creator_profiles.id = audience_members.creator_profile_id
    ) = current_setting('app.user_id', true)::text
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );
