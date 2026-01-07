-- Migration: Enforce data invariants at database level
-- Part of auth system hardening for production launch
--
-- This migration:
-- 1. Adds unique constraint on waitlist_invites.claim_token
-- 2. Adds partial unique index: one claimed profile per user
--
-- These constraints enforce business rules that were previously only
-- validated in application code.

-- ============================================================================
-- 1. Add unique constraint on waitlist_invites.claim_token
-- ============================================================================
-- Prevents duplicate claim tokens which could allow multiple profile claims

DO $$
BEGIN
  -- Check if index already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_waitlist_invites_claim_token_unique'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_invites_claim_token_unique
      ON waitlist_invites (claim_token);
    RAISE NOTICE 'Created unique index on waitlist_invites.claim_token';
  ELSE
    RAISE NOTICE 'Unique index on waitlist_invites.claim_token already exists';
  END IF;
END $$;

-- ============================================================================
-- 2. Add partial unique index: one claimed profile per user
-- ============================================================================
-- Enforces business rule: a user can only have ONE claimed profile
-- Uses partial index (WHERE is_claimed = true) to allow future multi-profile
-- support by simply dropping this constraint

DO $$
BEGIN
  -- Check if index already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_creator_profiles_one_claimed_per_user'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_one_claimed_per_user
      ON creator_profiles (user_id)
      WHERE is_claimed = true;
    RAISE NOTICE 'Created partial unique index: one claimed profile per user';
  ELSE
    RAISE NOTICE 'Partial unique index already exists: one claimed profile per user';
  END IF;
END $$;

-- ============================================================================
-- Verification: Check constraints are active
-- ============================================================================
DO $$
DECLARE
  claim_token_idx_exists BOOLEAN;
  claimed_profile_idx_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_waitlist_invites_claim_token_unique'
  ) INTO claim_token_idx_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_creator_profiles_one_claimed_per_user'
  ) INTO claimed_profile_idx_exists;

  IF claim_token_idx_exists AND claimed_profile_idx_exists THEN
    RAISE NOTICE '✓ Migration complete';
    RAISE NOTICE '  - Claim token uniqueness enforced';
    RAISE NOTICE '  - One claimed profile per user enforced';
  ELSE
    RAISE EXCEPTION 'Migration verification failed - indexes not created';
  END IF;
END $$;
