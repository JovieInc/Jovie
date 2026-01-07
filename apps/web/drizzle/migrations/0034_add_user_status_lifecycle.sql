-- Migration: Add user_status_lifecycle enum for comprehensive user lifecycle tracking
-- This replaces the dual-field system (waitlistApproval + waitlistEntryId + status)
-- with a single source of truth for user state

-- Create comprehensive user status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_lifecycle') THEN
    CREATE TYPE user_status_lifecycle AS ENUM (
      'waitlist_pending',      -- Submitted waitlist, awaiting approval
      'waitlist_approved',     -- Approved by admin, can claim invite
      'profile_claimed',       -- Claimed invite, needs onboarding
      'onboarding_incomplete', -- Started onboarding, not finished
      'active',                -- Fully onboarded and active
      'suspended',             -- Temporarily suspended
      'banned'                 -- Permanently banned
    );
  END IF;
END $$;

-- Add new column to users table (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'user_status'
  ) THEN
    ALTER TABLE users ADD COLUMN user_status user_status_lifecycle;
  END IF;
END $$;

-- Migrate existing data from dual-state to single enum
UPDATE users
SET user_status = CASE
  -- Banned users (explicit or soft-deleted)
  WHEN status = 'banned' OR deleted_at IS NOT NULL THEN 'banned'::user_status_lifecycle

  -- Active users (have completed onboarding)
  WHEN waitlist_approval = 'approved' AND id IN (
    SELECT user_id FROM creator_profiles
    WHERE onboarding_completed_at IS NOT NULL
      AND is_claimed = true
  ) THEN 'active'::user_status_lifecycle

  -- Profile claimed, onboarding incomplete
  WHEN waitlist_approval = 'approved' AND id IN (
    SELECT user_id FROM creator_profiles
    WHERE onboarding_completed_at IS NULL
      AND is_claimed = true
  ) THEN 'profile_claimed'::user_status_lifecycle

  -- Waitlist approved but no profile claimed yet
  WHEN waitlist_approval = 'approved' THEN 'waitlist_approved'::user_status_lifecycle

  -- Waitlist submitted but pending approval
  WHEN waitlist_approval = 'pending' THEN 'waitlist_pending'::user_status_lifecycle

  -- Default for any edge cases (no waitlist_approval set)
  ELSE 'waitlist_pending'::user_status_lifecycle
END
WHERE user_status IS NULL;

-- Make it NOT NULL after migration (idempotent)
DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN user_status SET NOT NULL;
EXCEPTION
  WHEN others THEN
    -- Column might already be NOT NULL
    NULL;
END $$;

-- Add index for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_user_status ON users(user_status);
