-- Lead claim tokens are stored hashed, like the profile token. Backfill the
-- hash for rows that only carry plaintext (same SHA-256 hex as
-- hashClaimToken), then drop the plaintext. Sent links keep working: the
-- claim route and funnel attribution resolve by hash.
-- Idempotent. The column stays (nullable) and is never written.
UPDATE "leads"
SET "claim_token_hash" = encode(sha256(convert_to("claim_token", 'UTF8')), 'hex')
WHERE "claim_token" IS NOT NULL
  AND "claim_token_hash" IS NULL;
--> statement-breakpoint
-- Unsent email leads hold a random legacy token that cannot be re-derived, so
-- the batch could never send it. Clear their lead-side hash so they leave the
-- send queue (isNotNull(claim_token_hash)) instead of being claimed and
-- released every run; they need re-approval, which mints a derivable token and
-- a fresh approved-copy revision. Profile hashes are untouched, so any link
-- already shown still claims.
UPDATE "leads"
SET "claim_token_hash" = NULL,
    "claim_token_expires_at" = NULL
WHERE "claim_token" IS NOT NULL
  AND "outreach_status" = 'pending'
  AND "outreach_route" IN ('email', 'both');
--> statement-breakpoint
UPDATE "leads"
SET "claim_token" = NULL
WHERE "claim_token" IS NOT NULL;
