-- Add UTM campaign tracking parameters to audience members
-- Stores utm_source, utm_medium, utm_campaign, utm_content, utm_term from landing page URLs

ALTER TABLE "audience_members"
  ADD COLUMN IF NOT EXISTS "utm_params" jsonb DEFAULT '{}'::jsonb;
