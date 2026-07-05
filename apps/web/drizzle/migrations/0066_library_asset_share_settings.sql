DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'library_asset_visibility' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."library_asset_visibility" AS ENUM('public', 'private');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_asset_share_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"asset_id" text NOT NULL,
	"item_kind" text NOT NULL,
	"visibility" "library_asset_visibility" DEFAULT 'private' NOT NULL,
	"share_slug" text NOT NULL,
	"access_token" text NOT NULL,
	"token_revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_asset_share_settings_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "library_asset_share_settings"
      ADD CONSTRAINT "library_asset_share_settings_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_asset_share_settings_creator_asset_unique" ON "library_asset_share_settings" USING btree ("creator_profile_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_asset_share_settings_creator_slug_unique" ON "library_asset_share_settings" USING btree ("creator_profile_id","share_slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_asset_share_settings_access_token_unique" ON "library_asset_share_settings" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_asset_share_settings_creator_visibility_idx" ON "library_asset_share_settings" USING btree ("creator_profile_id","visibility");