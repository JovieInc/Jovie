-- Pre-Deployment Validation Queries
-- Run these queries BEFORE applying migrations 0035-0037
-- All queries should return 0 rows/count for safe deployment

-- ============================================================================
-- 1. CHECK FOR DUPLICATE EMAILS IN WAITLIST
-- ============================================================================
-- MUST RETURN 0 ROWS
-- If this returns rows, fix duplicates manually before migration
SELECT
  LOWER(email) as normalized_email,
  COUNT(*) as duplicate_count,
  array_agg(id) as entry_ids,
  array_agg(status) as statuses,
  array_agg(created_at::date) as created_dates
FROM waitlist_entries
GROUP BY LOWER(email)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Fix duplicates with:
-- DELETE FROM waitlist_entries WHERE id = '<duplicate-id>';

-- ============================================================================
-- 2. CHECK FOR DUPLICATE USERNAMES IN CREATOR PROFILES
-- ============================================================================
-- MUST RETURN 0 ROWS
-- If this returns rows, fix duplicates manually before migration
SELECT
  username_normalized,
  COUNT(*) as duplicate_count,
  array_agg(id) as profile_ids,
  array_agg(user_id) as user_ids,
  array_agg(is_claimed) as claimed_status
FROM creator_profiles
GROUP BY username_normalized
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Fix duplicates by renaming:
-- UPDATE creator_profiles
-- SET username = 'newname', username_normalized = 'newname'
-- WHERE id = '<duplicate-id>';

-- ============================================================================
-- 3. VERIFY ALL USERS HAVE userStatus SET
-- ============================================================================
-- MUST RETURN 0
-- If this returns > 0, migration 0034 didn't run or data is inconsistent
SELECT COUNT(*) as users_without_status
FROM users
WHERE user_status IS NULL;

-- Fix with:
-- UPDATE users SET user_status = 'waitlist_pending' WHERE user_status IS NULL;

-- ============================================================================
-- 4. CHECK FOR REJECTED WAITLIST ENTRIES
-- ============================================================================
-- SHOULD RETURN 0 (rejected status is unused in codebase)
-- If this returns rows, they'll be migrated to 'new' status
SELECT
  COUNT(*) as rejected_count,
  array_agg(id) as entry_ids,
  array_agg(email) as emails
FROM waitlist_entries
WHERE status = 'rejected';

-- These will be auto-migrated to 'new' by migration 0035

-- ============================================================================
-- 5. VERIFY userStatus VALUES ARE VALID
-- ============================================================================
-- MUST RETURN 0
-- Checks for any invalid enum values
SELECT
  COUNT(*) as invalid_count,
  user_status,
  array_agg(clerk_id) as clerk_ids
FROM users
WHERE user_status NOT IN (
  'waitlist_pending',
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
  'suspended',
  'banned'
)
GROUP BY user_status;

-- ============================================================================
-- 6. CHECK STATUS FIELD CONSISTENCY
-- ============================================================================
-- Shows how old status fields map to new userStatus
-- Verify the mapping makes sense for your data
SELECT
  status as old_status,
  waitlist_approval as old_waitlist,
  user_status as new_status,
  COUNT(*) as count
FROM users
GROUP BY status, waitlist_approval, user_status
ORDER BY count DESC;

-- Expected mapping:
-- old_status | old_waitlist | new_status           | count
-- -----------|--------------|----------------------|------
-- active     | approved     | active               | XXXX
-- pending    | pending      | waitlist_pending     | XXX
-- banned     | NULL         | banned               | X

-- ============================================================================
-- 7. VERIFY PROFILE CLAIM STATES
-- ============================================================================
-- Users with profile_claimed status should have unclaimed profiles
SELECT
  u.user_status,
  u.clerk_id,
  cp.is_claimed,
  cp.onboarding_completed_at IS NOT NULL as has_completed_onboarding,
  COUNT(*) OVER () as total_profile_claimed_users
FROM users u
LEFT JOIN creator_profiles cp ON cp.user_id = u.id
WHERE u.user_status = 'profile_claimed'
LIMIT 10;

-- Expected: is_claimed = true, has_completed_onboarding = false

-- ============================================================================
-- 8. CHECK FOR ORPHANED WAITLIST ENTRIES
-- ============================================================================
-- Waitlist entries that should have been claimed but user doesn't exist
SELECT
  we.id,
  we.email,
  we.status,
  we.created_at,
  u.id as user_id,
  u.user_status
FROM waitlist_entries we
LEFT JOIN users u ON LOWER(u.email) = LOWER(we.email)
WHERE we.status = 'claimed'
  AND u.id IS NULL
LIMIT 10;

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================
SELECT
  'Total Users' as metric,
  COUNT(*)::text as value
FROM users
UNION ALL
SELECT
  'Users with userStatus set',
  COUNT(*)::text
FROM users
WHERE user_status IS NOT NULL
UNION ALL
SELECT
  'Waitlist Entries',
  COUNT(*)::text
FROM waitlist_entries
UNION ALL
SELECT
  'Creator Profiles',
  COUNT(*)::text
FROM creator_profiles
UNION ALL
SELECT
  'Duplicate Emails',
  COUNT(*)::text
FROM (
  SELECT LOWER(email)
  FROM waitlist_entries
  GROUP BY LOWER(email)
  HAVING COUNT(*) > 1
) dups
UNION ALL
SELECT
  'Duplicate Usernames',
  COUNT(*)::text
FROM (
  SELECT username_normalized
  FROM creator_profiles
  GROUP BY username_normalized
  HAVING COUNT(*) > 1
) dups;
