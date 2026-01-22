ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "spotify_popularity" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_link_type" ON "click_events" USING btree ("creator_profile_id","link_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tips_created_at" ON "tips" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_social_links_active" ON "social_links" USING btree ("creator_profile_id","is_active","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_id_claimed" ON "creator_profiles" USING btree ("user_id","is_claimed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_spotify_id" ON "creator_profiles" USING btree ("spotify_id") WHERE spotify_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_email" ON "waitlist_entries" USING btree ("email");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discog_releases" ADD CONSTRAINT "discog_releases_spotify_popularity_range" CHECK (spotify_popularity >= 0 AND spotify_popularity <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
