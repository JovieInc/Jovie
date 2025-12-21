-- Migration: Add UNIQUE constraint on username_normalized
-- Purpose: Prevent race conditions where two users claim the same handle simultaneously
-- This is a CRITICAL security fix for the onboarding flow

-- First, check for and handle any existing duplicates
-- This CTE identifies duplicates and keeps only the oldest profile for each normalized username
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Count duplicates first
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT username_normalized
    FROM creator_profiles
    WHERE username_normalized IS NOT NULL
    GROUP BY username_normalized
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % duplicate username_normalized values. Resolving by keeping oldest profile...', duplicate_count;

    -- For each duplicate set, keep the oldest (first created) and null out the rest
    -- This preserves data while allowing the unique constraint to be added
    UPDATE creator_profiles cp
    SET username_normalized = username_normalized || '-duplicate-' || id::text,
        username = username || '-duplicate-' || id::text
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY username_normalized ORDER BY created_at ASC, id ASC) as rn
        FROM creator_profiles
        WHERE username_normalized IS NOT NULL
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- Now add the unique constraint
-- Using a partial index to only enforce uniqueness for non-null values
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_username_normalized_unique"
  ON "creator_profiles" ("username_normalized")
  WHERE "username_normalized" IS NOT NULL;

-- Add a comment documenting the constraint
COMMENT ON INDEX "creator_profiles_username_normalized_unique" IS
  'Ensures unique handles for creator profiles. Added to prevent race conditions during onboarding.';
