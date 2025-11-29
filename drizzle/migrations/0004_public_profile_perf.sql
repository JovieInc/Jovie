-- Migration: Public profile hot path performance
-- Purpose: reduce latency for public profile fetches by optimizing social link ordering
-- Date: 2025-02-27

-- Composite index to cover creator_profile_id lookups and sort_order ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_links_creator_profile_id_sort
  ON social_links(creator_profile_id, sort_order);
