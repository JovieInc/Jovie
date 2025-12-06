-- Migration: Fix concurrent index creation issues
-- Date: 2025-12-06
-- Description: Drops and recreates indexes without CONCURRENTLY keyword.
--              CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
--              which is required for Drizzle's migrate() function.

-- Drop the dedup_key index from migration 0002 if it exists
DROP INDEX IF EXISTS idx_ingestion_jobs_dedup_key;

-- Recreate without CONCURRENTLY
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_dedup_key
ON ingestion_jobs (dedup_key)
WHERE dedup_key IS NOT NULL;

-- Drop waitlist indexes from migration 0003 if they exist
DROP INDEX IF EXISTS idx_waitlist_entries_created_at;
DROP INDEX IF EXISTS idx_waitlist_entries_status;
DROP INDEX IF EXISTS idx_waitlist_entries_email;

-- Recreate without CONCURRENTLY
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_created_at ON waitlist_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_email ON waitlist_entries (email);
