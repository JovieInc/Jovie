-- Migration: Add unique constraints and remove 'rejected' status
-- Part of auth system consolidation to single userStatus field
--
-- This migration:
-- 1. Adds case-insensitive unique constraint on waitlist emails
-- 2. Adds case-insensitive unique constraint on creator profile usernames
-- 3. Removes 'rejected' value from waitlist_status enum
--
-- IMPORTANT: Run pre-deployment validation queries before applying this migration
-- to ensure no duplicate data exists.

-- ============================================================================
-- 1. Add case-insensitive unique constraint on waitlist emails
-- ============================================================================
-- This prevents duplicate waitlist entries with different casing
-- (e.g., "Test@Example.com" vs "test@example.com")

DO $$
BEGIN
  -- Check if index already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_waitlist_entries_email_unique'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_entries_email_unique
      ON waitlist_entries (LOWER(email));
    RAISE NOTICE 'Created unique index on waitlist_entries.email';
  ELSE
    RAISE NOTICE 'Unique index on waitlist_entries.email already exists';
  END IF;
END $$;

-- ============================================================================
-- 2. Add case-insensitive unique constraint on creator profile usernames
-- ============================================================================
-- This makes the existing collision detection in approve/route.ts redundant
-- and enforces username uniqueness at the database level

DO $$
BEGIN
  -- Check if index already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_creator_profiles_username_unique'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_username_unique
      ON creator_profiles (username_normalized);
    RAISE NOTICE 'Created unique index on creator_profiles.username_normalized';
  ELSE
    RAISE NOTICE 'Unique index on creator_profiles.username_normalized already exists';
  END IF;
END $$;

-- ============================================================================
-- 3. Remove 'rejected' from waitlist_status enum
-- ============================================================================
-- The 'rejected' status is never used in the codebase, so we're removing it
-- to simplify the enum and prevent confusion.

-- Step 1: Migrate any 'rejected' entries to 'new' (defensive - should be none)
DO $$
DECLARE
  rejected_count INTEGER;
  updated_count INTEGER;
BEGIN
  -- First count rejected entries
  SELECT COUNT(*) INTO rejected_count
  FROM waitlist_entries
  WHERE status = 'rejected';

  -- Then migrate them
  UPDATE waitlist_entries
  SET status = 'new'
  WHERE status = 'rejected';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF rejected_count > 0 THEN
    RAISE WARNING 'Found and migrated % rejected entries to new status', rejected_count;
  ELSE
    RAISE NOTICE 'No rejected entries found (as expected)';
  END IF;
END $$;

-- Step 2: Create new enum without 'rejected'
DO $$
BEGIN
  -- Only create if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status_new') THEN
    CREATE TYPE waitlist_status_new AS ENUM ('new', 'invited', 'claimed');
    RAISE NOTICE 'Created new waitlist_status_new enum';
  ELSE
    RAISE NOTICE 'waitlist_status_new enum already exists';
  END IF;
END $$;

-- Step 3: Alter column to use new type
DO $$
BEGIN
  -- Check if column is still using old type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waitlist_entries'
      AND column_name = 'status'
      AND udt_name = 'waitlist_status'
  ) THEN
    ALTER TABLE waitlist_entries
      ALTER COLUMN status TYPE waitlist_status_new
      USING status::text::waitlist_status_new;
    RAISE NOTICE 'Updated waitlist_entries.status to use waitlist_status_new';
  ELSE
    RAISE NOTICE 'waitlist_entries.status already using new type';
  END IF;
END $$;

-- Step 4: Drop old enum and rename new one
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    -- Drop without CASCADE to fail loudly if unexpected dependencies exist
    -- All known dependencies (waitlist_entries.status) were migrated in Step 3
    DROP TYPE waitlist_status;
    RAISE NOTICE 'Dropped old waitlist_status enum';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status_new') THEN
    ALTER TYPE waitlist_status_new RENAME TO waitlist_status;
    RAISE NOTICE 'Renamed waitlist_status_new to waitlist_status';
  END IF;
END $$;

-- ============================================================================
-- Verification: Check no data was lost
-- ============================================================================
DO $$
DECLARE
  entry_count INTEGER;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO entry_count FROM waitlist_entries;
  SELECT COUNT(*) INTO profile_count FROM creator_profiles;

  RAISE NOTICE '✓ Migration complete';
  RAISE NOTICE '  - Waitlist entries: %', entry_count;
  RAISE NOTICE '  - Creator profiles: %', profile_count;
  RAISE NOTICE '  - Unique constraints enforced on email and username';
  RAISE NOTICE '  - Rejected status removed from enum';
END $$;
