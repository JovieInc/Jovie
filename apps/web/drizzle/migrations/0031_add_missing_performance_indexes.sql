-- Migration: Add missing performance indexes and cleanup orphaned table
-- Date: 2026-01-03
-- Description: Adds missing indexes for ingestion_jobs and creator_profiles tables,
--              and removes the orphaned artist_contacts table that was replaced by creator_contacts.

--------------------------------------------------------------------------------
-- INGESTION_JOBS: Add composite indexes for job scheduling performance
--------------------------------------------------------------------------------

-- Composite index for job claiming query pattern:
-- WHERE status = 'pending' AND run_at <= now AND attempts < max_attempts
-- ORDER BY priority ASC, run_at ASC
-- This index covers the WHERE clause and ORDER BY for optimal performance
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_claim_queue
  ON ingestion_jobs (status, priority, run_at)
  WHERE status = 'pending';

-- Composite index for stuck job detection query pattern:
-- WHERE status = 'processing' AND updated_at <= stuckBefore
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_stuck_detection
  ON ingestion_jobs (status, updated_at)
  WHERE status = 'processing';

--------------------------------------------------------------------------------
-- CREATOR_PROFILES: Add created_at index for sorting queries
--------------------------------------------------------------------------------

-- Index on created_at for sorting new creators, admin queries, and analytics
CREATE INDEX IF NOT EXISTS idx_creator_profiles_created_at
  ON creator_profiles (created_at DESC);

--------------------------------------------------------------------------------
-- CLEANUP: Remove orphaned artist_contacts table
-- Note: This table was created in migration 0000 but replaced by creator_contacts
--       in migration 0004 with a different schema. It has no remaining references.
--------------------------------------------------------------------------------

-- First drop RLS policies on the orphaned table
DO $$
BEGIN
  -- Drop all policies if they exist
  DROP POLICY IF EXISTS "artist_contacts_select_own" ON artist_contacts;
  DROP POLICY IF EXISTS "artist_contacts_insert_own" ON artist_contacts;
  DROP POLICY IF EXISTS "artist_contacts_update_own" ON artist_contacts;
  DROP POLICY IF EXISTS "artist_contacts_delete_own" ON artist_contacts;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, nothing to do
    NULL;
END $$;

-- Drop the orphaned table if it exists
DROP TABLE IF EXISTS artist_contacts CASCADE;
