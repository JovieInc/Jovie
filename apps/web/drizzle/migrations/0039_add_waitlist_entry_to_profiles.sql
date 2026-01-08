-- Migration: Add waitlist_entry_id to creator_profiles
-- Links profiles created during public signup to their originating waitlist entry
-- Part of simplified signup flow implementation

-- Add waitlistEntryId column to creator_profiles for direct linking
ALTER TABLE creator_profiles
ADD COLUMN IF NOT EXISTS waitlist_entry_id UUID REFERENCES waitlist_entries(id) ON DELETE SET NULL;

-- Index for queries joining profiles → waitlist
CREATE INDEX IF NOT EXISTS idx_creator_profiles_waitlist_entry
ON creator_profiles(waitlist_entry_id);

-- Add column comment for documentation
COMMENT ON COLUMN creator_profiles.waitlist_entry_id IS
'Links profiles created during public signup to their originating waitlist entry. NULL for admin-ingested creators or pre-existing profiles.';

-- Verification
DO $$
DECLARE
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM creator_profiles;

  RAISE NOTICE '✓ Migration complete';
  RAISE NOTICE '  - Creator profiles: %', profile_count;
  RAISE NOTICE '  - Added waitlist_entry_id column (nullable)';
  RAISE NOTICE '  - Added index idx_creator_profiles_waitlist_entry';
  RAISE NOTICE '  - Existing profiles have NULL waitlist_entry_id (expected)';
END $$;
