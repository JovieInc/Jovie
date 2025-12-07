-- Migration: Fix all CONCURRENTLY index creation issues
-- Date: 2025-12-07
-- Description: Drops and recreates all indexes that were created with CONCURRENTLY keyword.
--              CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
--              which is required for Drizzle's migrate() function.
--              This migration fixes indexes from migrations 0002, 0003, 0004, and 0007.

--------------------------------------------------------------------------------
-- FIX MIGRATION 0002: ingestion_jobs.dedup_key index
--------------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_ingestion_jobs_dedup_key;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_dedup_key
ON ingestion_jobs (dedup_key)
WHERE dedup_key IS NOT NULL;

--------------------------------------------------------------------------------
-- FIX MIGRATION 0003: waitlist_entries indexes
--------------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_waitlist_entries_created_at;
DROP INDEX IF EXISTS idx_waitlist_entries_status;
DROP INDEX IF EXISTS idx_waitlist_entries_email;

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_created_at ON waitlist_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_email ON waitlist_entries (email);

--------------------------------------------------------------------------------
-- FIX MIGRATION 0004: creator_contacts indexes
--------------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_creator_contacts_profile_id;
DROP INDEX IF EXISTS idx_creator_contacts_active;

CREATE INDEX IF NOT EXISTS idx_creator_contacts_profile_id
  ON creator_contacts(creator_profile_id);

CREATE INDEX IF NOT EXISTS idx_creator_contacts_active
  ON creator_contacts(creator_profile_id, is_active)
  WHERE is_active = true;

--------------------------------------------------------------------------------
-- FIX MIGRATION 0007: creator_profiles performance indexes
--------------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_creator_profiles_username;
DROP INDEX IF EXISTS idx_creator_profiles_is_active_username;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_username
  ON creator_profiles(username);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_is_active_username
  ON creator_profiles(is_active, username)
  WHERE is_active = true;
