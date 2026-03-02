-- Add Stripe Connect fields to creator_profiles for Express onboarding
ALTER TABLE "creator_profiles"
ADD COLUMN IF NOT EXISTS "stripe_account_id" text,
ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;
