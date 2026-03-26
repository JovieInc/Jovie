CREATE TABLE "artist_identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"external_id" text,
	"source" text NOT NULL,
	"source_request_url" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_identity_links" ADD CONSTRAINT "artist_identity_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ail_profile_source_platform_uniq" ON "artist_identity_links" USING btree ("creator_profile_id","source","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ail_profile_idx" ON "artist_identity_links" USING btree ("creator_profile_id","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ail_platform_source_idx" ON "artist_identity_links" USING btree ("platform","source");