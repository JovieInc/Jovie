DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_slug_type') THEN
    CREATE TYPE "public"."content_slug_type" AS ENUM('release', 'track');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "content_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"content_type" "content_slug_type" NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_slug_redirects_content_match" CHECK (
        (content_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL)
        OR (content_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL)
      )
);
--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_slug_redirects_creator_old_slug" ON "content_slug_redirects" USING btree ("creator_profile_id","old_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_slug_redirects_old_slug_idx" ON "content_slug_redirects" USING btree ("old_slug");