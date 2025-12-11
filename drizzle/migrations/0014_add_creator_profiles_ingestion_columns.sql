-- Idempotent backfill for creator_profiles columns required by ingestion
ALTER TABLE "creator_profiles"
  ADD COLUMN IF NOT EXISTS "claim_token_expires_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "claimed_from_ip" TEXT,
  ADD COLUMN IF NOT EXISTS "claimed_user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "last_ingestion_error" TEXT,
  ADD COLUMN IF NOT EXISTS "settings" JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "theme" JSONB DEFAULT '{}'::jsonb;
