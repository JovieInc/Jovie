-- Lead claim tokens are stored hashed, like the profile token. Backfill the
-- hash for rows that only carry plaintext (same SHA-256 hex as
-- hashClaimToken), then drop the plaintext. The sent links keep working: the
-- claim route and funnel attribution resolve by hash. Unsent leads whose
-- random token can no longer be re-derived are routed again and mint a
-- derivable one. Idempotent. The column stays (nullable) and is never written.
UPDATE "leads"
SET "claim_token_hash" = encode(sha256(convert_to("claim_token", 'UTF8')), 'hex')
WHERE "claim_token" IS NOT NULL
  AND "claim_token_hash" IS NULL;
--> statement-breakpoint
UPDATE "leads"
SET "claim_token" = NULL
WHERE "claim_token" IS NOT NULL;
