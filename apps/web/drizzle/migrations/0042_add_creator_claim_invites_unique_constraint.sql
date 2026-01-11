-- Migration: Add unique constraint to creator_claim_invites
-- Date: 2026-01-11
-- Description: Adds unique index on (creator_profile_id, email) to prevent duplicate invites.
--              This enables the onConflictDoNothing behavior to work properly.

--------------------------------------------------------------------------------
-- CREATOR_CLAIM_INVITES: Add unique constraint on (creator_profile_id, email)
--------------------------------------------------------------------------------

-- Unique index to prevent duplicate invites for same profile + email
-- This constraint ensures only one invite can exist per profile/email combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_claim_invites_profile_email_unique
  ON creator_claim_invites (creator_profile_id, email);
