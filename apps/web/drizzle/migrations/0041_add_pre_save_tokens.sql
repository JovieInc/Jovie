CREATE TABLE IF NOT EXISTS "pre_save_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "release_id" uuid NOT NULL,
  "track_id" uuid,
  "provider" text NOT NULL,
  "spotify_account_id" text,
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "encrypted_apple_music_user_token" text,
  "fan_email" text,
  "executed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "pre_save_tokens"
  ADD CONSTRAINT "pre_save_tokens_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "pre_save_tokens"
  ADD CONSTRAINT "pre_save_tokens_release_id_discog_releases_id_fk"
  FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pre_save_tokens"
  ADD CONSTRAINT "pre_save_tokens_track_id_discog_tracks_id_fk"
  FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "pre_save_tokens_release_id_idx" ON "pre_save_tokens" ("release_id");
CREATE INDEX IF NOT EXISTS "pre_save_tokens_provider_idx" ON "pre_save_tokens" ("provider");
CREATE INDEX IF NOT EXISTS "pre_save_tokens_executed_at_idx" ON "pre_save_tokens" ("executed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pre_save_tokens_spotify_unique_idx" ON "pre_save_tokens" ("release_id", "provider", "spotify_account_id");
