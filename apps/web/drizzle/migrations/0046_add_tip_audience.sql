-- Tip Audience: fan email capture from tips (JOV-1131)
DO $$ BEGIN
  CREATE TYPE "tip_audience_source" AS ENUM ('tip', 'link_click', 'save', 'manual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tip_audience" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "name" text,
  "source" "tip_audience_source" NOT NULL DEFAULT 'tip',
  "tip_amount_total_cents" integer NOT NULL DEFAULT 0,
  "tip_count" integer NOT NULL DEFAULT 0,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "marketing_opt_in" boolean NOT NULL DEFAULT false,
  "unsubscribed" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraint: one row per (profile, email)
CREATE UNIQUE INDEX IF NOT EXISTS "tip_audience_profile_id_email_unique"
  ON "tip_audience" ("profile_id", "email");

-- Index: list fans by recency
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_last_seen_at_idx"
  ON "tip_audience" ("profile_id", "last_seen_at");

-- Index: list fans by creation date
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_created_at_idx"
  ON "tip_audience" ("profile_id", "created_at");

-- Index: lookup by email (only non-unsubscribed)
CREATE INDEX IF NOT EXISTS "tip_audience_email_idx"
  ON "tip_audience" ("email") WHERE unsubscribed = false;
