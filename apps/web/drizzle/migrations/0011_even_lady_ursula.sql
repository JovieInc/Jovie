ALTER TABLE "artist_identity_links" ALTER COLUMN "raw_payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD COLUMN "photo_type" text DEFAULT 'avatar' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_type" ON "profile_photos" USING btree ("creator_profile_id","photo_type","status");
