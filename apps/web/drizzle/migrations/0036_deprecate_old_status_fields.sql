-- Migration: Prepare deprecation of old status fields
-- This migration adds comments and warnings but doesn't drop columns yet
-- Columns will be dropped in a future PR after code changes stabilize (2-4 weeks)
--
-- This migration:
-- 1. Adds deprecation comments to old columns
-- 2. Drops old indexes (safe - not used in queries after code migration)
-- 3. Verifies userStatus is set for all users

-- ============================================================================
-- 1. Add deprecation comments to old columns
-- ============================================================================

COMMENT ON COLUMN users.status IS
  'DEPRECATED (2026-01): Use users.user_status instead. Will be removed in future migration after code stabilizes.';

COMMENT ON COLUMN users.waitlist_approval IS
  'DEPRECATED (2026-01): Use users.user_status instead. Will be removed in future migration after code stabilizes.';

COMMENT ON COLUMN users.waitlist_entry_id IS
  'DEPRECATED (2026-01): Historical data only. Do not write to this field. Will be removed in future migration.';

RAISE NOTICE 'Added deprecation comments to old status fields';

-- ============================================================================
-- 2. Drop old indexes
-- ============================================================================
-- These indexes are safe to drop because the new code uses user_status field
-- and doesn't query the old status/waitlistApproval fields for auth decisions

DROP INDEX IF EXISTS idx_users_status;
DROP INDEX IF EXISTS idx_users_waitlist_approval;
DROP INDEX IF EXISTS idx_users_waitlist_entry_id;

RAISE NOTICE 'Dropped deprecated indexes';

-- ============================================================================
-- 3. Verification: Ensure userStatus is set for all users
-- ============================================================================
DO $$
DECLARE
  null_status_count INTEGER;
  total_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_status_count
  FROM users
  WHERE user_status IS NULL;

  SELECT COUNT(*) INTO total_users
  FROM users;

  IF null_status_count > 0 THEN
    RAISE EXCEPTION '% users have NULL user_status - migration 0034 incomplete! Run migration 0034 first.', null_status_count;
  ELSE
    RAISE NOTICE '✓ Migration complete';
    RAISE NOTICE '  - All % users have user_status set', total_users;
    RAISE NOTICE '  - Deprecated indexes dropped';
    RAISE NOTICE '  - Deprecation comments added';
    RAISE NOTICE '';
    RAISE NOTICE 'NOTE: Old columns (status, waitlist_approval, waitlist_entry_id)';
    RAISE NOTICE '      are still present for rollback safety. They will be';
    RAISE NOTICE '      removed in a future migration after 2-4 weeks of stable operation.';
  END IF;
END $$;
