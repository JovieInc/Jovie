-- Migration: Add waitlist_entries table for invite-only waitlist system

-- Create enum for waitlist status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE waitlist_status AS ENUM ('new', 'invited', 'claimed', 'rejected');
  END IF;
END $$;

-- Create waitlist_entries table
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  primary_social_url TEXT NOT NULL,
  primary_social_platform TEXT NOT NULL,
  primary_social_url_normalized TEXT NOT NULL,
  spotify_url TEXT,
  spotify_url_normalized TEXT,
  heard_about TEXT,
  status waitlist_status NOT NULL DEFAULT 'new',
  primary_social_follower_count INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for admin listing and filtering
-- Note: Cannot use CONCURRENTLY inside Drizzle transaction block
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_created_at ON waitlist_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_email ON waitlist_entries (email);
