-- Migration: Populate dedup_key column from JSONB payload
-- Date: 2025-12-06
-- Description: The dedup_key column exists but was never populated.
--              Queries were checking payload->>'dedupKey' instead of the indexed column,
--              causing full table scans. This migration backfills existing data.

-- Backfill dedup_key column from JSONB payload for existing records
UPDATE ingestion_jobs
SET dedup_key = payload->>'dedupKey'
WHERE dedup_key IS NULL
  AND payload ? 'dedupKey';
