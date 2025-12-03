-- Artist Contacts: structured contact points for public profiles

-- Contact roles enum (music industry focused)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_role') THEN
    CREATE TYPE contact_role AS ENUM (
      'bookings',
      'management',
      'press_pr',
      'brand_partnerships',
      'fan_general',
      'other'
    );
  END IF;
END $$;

-- Preferred contact channel enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE contact_channel AS ENUM ('email', 'phone');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS creator_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id uuid NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  role contact_role NOT NULL,
  custom_label text,
  person_name text,
  company_name text,
  territories jsonb NOT NULL DEFAULT '[]'::jsonb,
  email text,
  phone text,
  preferred_channel contact_channel,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT creator_contacts_channel_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_creator_contacts_profile
  ON creator_contacts (creator_profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_creator_contacts_role
  ON creator_contacts (role);

-- Enable RLS and policies: owners can manage, public can read public profiles
ALTER TABLE creator_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_contacts_select_public" ON creator_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = creator_contacts.creator_profile_id
        AND cp.is_public = true
    )
  );

CREATE POLICY "creator_contacts_select_own" ON creator_contacts
  FOR SELECT
  USING (
    current_setting('app.clerk_user_id', true)::text = (
      SELECT u.clerk_id
      FROM users u
      JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE cp.id = creator_contacts.creator_profile_id
    )
  );

CREATE POLICY "creator_contacts_insert_own" ON creator_contacts
  FOR INSERT
  WITH CHECK (
    current_setting('app.clerk_user_id', true)::text = (
      SELECT u.clerk_id
      FROM users u
      JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE cp.id = creator_contacts.creator_profile_id
    )
  );

CREATE POLICY "creator_contacts_update_own" ON creator_contacts
  FOR UPDATE
  USING (
    current_setting('app.clerk_user_id', true)::text = (
      SELECT u.clerk_id
      FROM users u
      JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE cp.id = creator_contacts.creator_profile_id
    )
  )
  WITH CHECK (
    current_setting('app.clerk_user_id', true)::text = (
      SELECT u.clerk_id
      FROM users u
      JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE cp.id = creator_contacts.creator_profile_id
    )
  );

CREATE POLICY "creator_contacts_delete_own" ON creator_contacts
  FOR DELETE
  USING (
    current_setting('app.clerk_user_id', true)::text = (
      SELECT u.clerk_id
      FROM users u
      JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE cp.id = creator_contacts.creator_profile_id
    )
  );
