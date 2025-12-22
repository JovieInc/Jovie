-- Migration: Add creator_contacts table
-- This table was defined in the Drizzle schema but never created in the database.
-- The database has an older 'artist_contacts' table with a different schema.
-- This migration creates the new table to match the current schema.

-- Create contact_role enum if it doesn't exist
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

-- Create contact_channel enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE contact_channel AS ENUM ('email', 'phone');
  END IF;
END $$;

-- Create creator_contacts table
CREATE TABLE IF NOT EXISTS creator_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  role contact_role NOT NULL,
  custom_label TEXT,
  person_name TEXT,
  company_name TEXT,
  territories TEXT[],
  email TEXT,
  phone TEXT,
  preferred_channel contact_channel,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by creator profile
-- Note: Cannot use CONCURRENTLY inside Drizzle transaction block
CREATE INDEX IF NOT EXISTS idx_creator_contacts_profile_id
  ON creator_contacts(creator_profile_id);

-- Create index for active contacts
CREATE INDEX IF NOT EXISTS idx_creator_contacts_active
  ON creator_contacts(creator_profile_id, is_active)
  WHERE is_active = true;
