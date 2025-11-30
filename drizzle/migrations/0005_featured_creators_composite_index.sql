-- Migration: Featured creators composite index
-- Purpose: Optimize featured creators query by covering public/featured/marketing_opt_out filters
-- Date: 2025-11-28

CREATE INDEX IF NOT EXISTS idx_creator_profiles_featured_query
  ON creator_profiles (is_public, is_featured, marketing_opt_out)
  WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
