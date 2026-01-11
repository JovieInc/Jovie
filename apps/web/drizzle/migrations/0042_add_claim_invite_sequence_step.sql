-- Add sequence_step column to creator_claim_invites for follow-up email tracking
-- sequence_step: 0=initial invite, 1=first follow-up, 2=second follow-up, etc.

-- Add sequence_step column with default 0
ALTER TABLE creator_claim_invites
ADD COLUMN IF NOT EXISTS sequence_step INTEGER NOT NULL DEFAULT 0;

-- Add index for finding profiles that need follow-ups
-- This index helps query: "find all profiles where we sent step N more than X days ago"
CREATE INDEX IF NOT EXISTS idx_creator_claim_invites_sequence_sent
ON creator_claim_invites (creator_profile_id, sequence_step, sent_at);

-- Add comment for documentation
COMMENT ON COLUMN creator_claim_invites.sequence_step IS
  'Email sequence position: 0=initial invite, 1=first follow-up, 2=second follow-up, etc.';
