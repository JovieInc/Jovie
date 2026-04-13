CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "promo_downloads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL REFERENCES "public"."creator_profiles"("id") ON DELETE cascade,
  "release_id" uuid NOT NULL REFERENCES "public"."discog_releases"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size_bytes" integer,
  "file_mime_type" text NOT NULL,
  "artwork_url" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "promo_download_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "promo_download_id" uuid NOT NULL REFERENCES "public"."promo_downloads"("id") ON DELETE cascade,
  "creator_profile_id" uuid NOT NULL REFERENCES "public"."creator_profiles"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "country" text,
  "city" text,
  "downloaded_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "promo_downloads_release_id_slug_unique"
  ON "promo_downloads" USING btree ("release_id", "slug");

CREATE INDEX IF NOT EXISTS "promo_downloads_release_id_is_active_position_idx"
  ON "promo_downloads" USING btree ("release_id", "is_active", "position");

CREATE INDEX IF NOT EXISTS "promo_download_events_promo_download_id_downloaded_at_idx"
  ON "promo_download_events" USING btree ("promo_download_id", "downloaded_at");

CREATE INDEX IF NOT EXISTS "promo_download_events_email_idx"
  ON "promo_download_events" USING btree ("email");
