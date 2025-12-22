-- Migration: Add missing claim and ingestion columns
-- Date: 2025-12-06
-- Description: Adds columns to creator_profiles and ingestion_jobs that exist in
--              the Drizzle schema but were missing from the initial migration.
--              These columns are required for the claim flow and ingestion job processing.

--------------------------------------------------------------------------------
-- CREATOR_PROFILES: Add claim-related columns
--------------------------------------------------------------------------------

-- Token expiration for time-limited claim links
ALTER TABLE creator_profiles
ADD COLUMN claim_token_expires_at TIMESTAMP;

-- Audit columns for claim tracking
ALTER TABLE creator_profiles
ADD COLUMN claimed_from_ip TEXT;

ALTER TABLE creator_profiles
ADD COLUMN claimed_user_agent TEXT;

-- Ingestion error tracking
ALTER TABLE creator_profiles
ADD COLUMN last_ingestion_error TEXT;

--------------------------------------------------------------------------------
-- INGESTION_JOBS: Add job processing columns
--------------------------------------------------------------------------------

-- Maximum retry attempts before marking as failed
ALTER TABLE ingestion_jobs
ADD COLUMN max_attempts INTEGER DEFAULT 3 NOT NULL;

-- Scheduled next run time for retries
ALTER TABLE ingestion_jobs
ADD COLUMN next_run_at TIMESTAMP;

-- Deduplication key to prevent duplicate jobs
ALTER TABLE ingestion_jobs
ADD COLUMN dedup_key TEXT;

-- Index for dedup_key lookups (partial index for non-null values only)
-- Note: Cannot use CONCURRENTLY inside Drizzle transaction block
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_dedup_key 
ON ingestion_jobs (dedup_key) 
WHERE dedup_key IS NOT NULL;
