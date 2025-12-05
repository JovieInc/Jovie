-- 0014_recreate_audience_fingerprint_index_concurrent.sql
-- Recreates the audience_members fingerprint unique index with CONCURRENTLY
-- to avoid blocking writes during index creation.
--
-- Context: Migration 0012 created this index without CONCURRENTLY, which would
-- cause exclusive table locks and block all writes during deployment.
-- This migration drops the old index and recreates it with CONCURRENTLY.

-- Drop the existing index (created by migration 0012)
DROP INDEX IF EXISTS uniq_audience_members_creator_fingerprint;

-- Recreate with CONCURRENTLY for zero-downtime deployment
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_audience_members_creator_fingerprint
  ON audience_members (creator_profile_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
