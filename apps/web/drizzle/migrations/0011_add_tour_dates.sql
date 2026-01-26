-- Add tour date provider enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_date_provider') THEN
    CREATE TYPE "tour_date_provider" AS ENUM ('bandsintown', 'songkick', 'manual');
  END IF;
END $$;

-- Add ticket status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE "ticket_status" AS ENUM ('available', 'sold_out', 'cancelled');
  END IF;
END $$;

-- Add bandsintown_artist_name to creator_profiles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'creator_profiles' AND column_name = 'bandsintown_artist_name'
  ) THEN
    ALTER TABLE "creator_profiles" ADD COLUMN "bandsintown_artist_name" text;
  END IF;
END $$;

-- Create tour_dates table
CREATE TABLE IF NOT EXISTS "tour_dates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "external_id" text,
  "provider" "tour_date_provider" DEFAULT 'manual' NOT NULL,
  "title" text,
  "start_date" timestamp with time zone NOT NULL,
  "start_time" text,
  "venue_name" text NOT NULL,
  "city" text NOT NULL,
  "region" text,
  "country" text NOT NULL,
  "latitude" real,
  "longitude" real,
  "ticket_url" text,
  "ticket_status" "ticket_status" DEFAULT 'available' NOT NULL,
  "last_synced_at" timestamp with time zone,
  "raw_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes (idempotent)
CREATE INDEX IF NOT EXISTS "idx_tour_dates_profile_id" ON "tour_dates" ("profile_id");
CREATE INDEX IF NOT EXISTS "idx_tour_dates_start_date" ON "tour_dates" ("start_date");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tour_dates_external_id_provider" ON "tour_dates" ("profile_id", "external_id", "provider");
