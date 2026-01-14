-- Migration: Add unique index on ingestion_jobs.dedup_key for job deduplication
-- Date: 2026-01-11
-- Description: Adds a unique partial index on dedup_key column to prevent duplicate job entries.
--              Also adds a composite index for status+run_at to improve job scheduling queries.

--------------------------------------------------------------------------------
-- INGESTION_JOBS: Add unique index on dedup_key for job deduplication
--------------------------------------------------------------------------------

-- Partial unique index on dedup_key (only for non-null values)
-- This enables the onConflictDoNothing behavior in Drizzle ORM
-- for duplicate job prevention (e.g., send_claim_invite jobs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_dedup_key_unique
  ON ingestion_jobs (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Composite index for status+run_at to improve job scheduling queries
-- Covers: WHERE status = 'pending' AND run_at <= now ORDER BY run_at
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_run_at
  ON ingestion_jobs (status, run_at);
