CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "creator_profiles"
SET "claim_token" = encode(digest("claim_token", 'sha256'), 'hex')
WHERE "claim_token" IS NOT NULL
  AND "claim_token" !~* '^[0-9a-f]{64}$';

UPDATE "waitlist_invites"
SET "claim_token" = encode(digest("claim_token", 'sha256'), 'hex')
WHERE "claim_token" !~* '^[0-9a-f]{64}$';
