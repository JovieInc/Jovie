DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_status') THEN
    CREATE TYPE "outreach_status" AS ENUM ('pending', 'dm_generated', 'dm_sent', 'responded');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_channel') THEN
    CREATE TYPE "outreach_channel" AS ENUM ('instagram', 'twitter');
  END IF;
END $$;

ALTER TABLE "creator_profiles"
  ADD COLUMN IF NOT EXISTS "outreach_status" "outreach_status" DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "outreach_channel" "outreach_channel",
  ADD COLUMN IF NOT EXISTS "dm_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "dm_copy" text,
  ADD COLUMN IF NOT EXISTS "outreach_priority" integer;

CREATE INDEX IF NOT EXISTS "idx_creator_profiles_outreach_status"
  ON "creator_profiles" ("outreach_status", "created_at");
