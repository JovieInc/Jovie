-- Migration: Update username unique index to exclude soft-deleted profiles
-- Date: 2025-12-28
-- Description: Updates the unique constraint on username_normalized to exclude soft-deleted profiles,
--              allowing usernames to be reclaimed after a profile is deleted.

-- Drop the existing unique index
DROP INDEX IF EXISTS creator_profiles_username_normalized_unique;

-- Recreate the unique index with the updated WHERE clause that excludes deleted profiles
CREATE UNIQUE INDEX creator_profiles_username_normalized_unique
ON creator_profiles(username_normalized)
WHERE username_normalized IS NOT NULL AND deleted_at IS NULL;
