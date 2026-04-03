CREATE TABLE "album_art_generation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"release_id" uuid,
	"draft_key" text,
	"mode" text NOT NULL,
	"template_source_type" text DEFAULT 'none' NOT NULL,
	"template_source_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"consumed_runs" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout_preset" text DEFAULT 'v1-title-artist-version' NOT NULL,
	"logo_asset_url" text,
	"logo_position" text DEFAULT 'top-left' NOT NULL,
	"logo_opacity" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"text_style_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_art_generation_sessions" ADD CONSTRAINT "album_art_generation_sessions_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_art_generation_sessions" ADD CONSTRAINT "album_art_generation_sessions_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_brand_kits" ADD CONSTRAINT "artist_brand_kits_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_art_sessions_profile_id_idx" ON "album_art_generation_sessions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_art_sessions_release_id_idx" ON "album_art_generation_sessions" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_art_sessions_draft_key_idx" ON "album_art_generation_sessions" USING btree ("draft_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_art_sessions_status_idx" ON "album_art_generation_sessions" USING btree ("profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_brand_kits_profile_id_idx" ON "artist_brand_kits" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_brand_kits_profile_default_idx" ON "artist_brand_kits" USING btree ("profile_id","is_default");
