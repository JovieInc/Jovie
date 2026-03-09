ALTER TABLE "social_links"
  ADD COLUMN "verification_token" text,
  ADD COLUMN "verification_status" text DEFAULT 'unverified',
  ADD COLUMN "verification_checked_at" timestamp,
  ADD COLUMN "verified_at" timestamp;
