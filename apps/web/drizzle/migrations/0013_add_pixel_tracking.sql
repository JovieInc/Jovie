-- Pixel Tracking Schema
-- Server-side pixel forwarding for creator ad platforms and Jovie marketing

-- Pixel event type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pixel_event_type') THEN
    CREATE TYPE "pixel_event_type" AS ENUM ('page_view', 'link_click', 'form_submit', 'scroll_depth');
  END IF;
END $$;--> statement-breakpoint

-- Pixel forward status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pixel_forward_status') THEN
    CREATE TYPE "pixel_forward_status" AS ENUM ('pending', 'sent', 'failed');
  END IF;
END $$;--> statement-breakpoint

-- Pixel events table - stores all tracking events from public profiles
CREATE TABLE IF NOT EXISTS "pixel_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL,
  "event_type" "pixel_event_type" NOT NULL,
  "event_data" jsonb DEFAULT '{}'::jsonb,
  "consent_given" boolean DEFAULT false NOT NULL,
  "ip_hash" text,
  "user_agent" text,
  "forwarding_status" jsonb DEFAULT '{}'::jsonb,
  "forward_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Creator pixel configurations - API credentials for server-side forwarding
CREATE TABLE IF NOT EXISTS "creator_pixels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "facebook_pixel_id" text,
  "facebook_access_token" text,
  "google_measurement_id" text,
  "google_api_secret" text,
  "tiktok_pixel_id" text,
  "tiktok_access_token" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "facebook_enabled" boolean DEFAULT true NOT NULL,
  "google_enabled" boolean DEFAULT true NOT NULL,
  "tiktok_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes for pixel_events
CREATE INDEX IF NOT EXISTS "idx_pixel_events_profile_id" ON "pixel_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_forwarding_queue" ON "pixel_events" USING btree ("forward_at", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_session_id" ON "pixel_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_profile_recent" ON "pixel_events" USING btree ("profile_id", "created_at");--> statement-breakpoint

-- Indexes for creator_pixels
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_pixels_profile_id_unique" ON "creator_pixels" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_pixels_enabled" ON "creator_pixels" USING btree ("enabled", "profile_id") WHERE enabled = true;
