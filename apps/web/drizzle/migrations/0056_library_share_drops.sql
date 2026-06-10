DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'library_share_drop_layout'
  ) THEN
    CREATE TYPE "public"."library_share_drop_layout" AS ENUM('grid', 'list', 'reel');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_share_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"layout" "library_share_drop_layout" DEFAULT 'grid' NOT NULL,
	"downloads_enabled" boolean DEFAULT true NOT NULL,
	"passphrase_hash" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"accent_color" text,
	"logo_url" text,
	"dark_mode" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_share_drop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"include_artwork" boolean DEFAULT true NOT NULL,
	"include_preview" boolean DEFAULT true NOT NULL,
	"include_lyrics" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_share_drops" ADD CONSTRAINT "library_share_drops_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "library_share_drop_items" ADD CONSTRAINT "library_share_drop_items_drop_id_library_share_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."library_share_drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "library_share_drop_items" ADD CONSTRAINT "library_share_drop_items_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_share_drops_token_unique" ON "library_share_drops" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_share_drops_creator_profile_id_idx" ON "library_share_drops" USING btree ("creator_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_share_drops_active_expires_idx" ON "library_share_drops" USING btree ("is_active","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_share_drop_items_drop_position_idx" ON "library_share_drop_items" USING btree ("drop_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_share_drop_items_drop_release_unique" ON "library_share_drop_items" USING btree ("drop_id","release_id");