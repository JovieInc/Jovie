DROP INDEX IF EXISTS "idx_creator_profiles_featured_with_name";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_featured_query" ON "creator_profiles" USING btree ("is_public","is_featured","marketing_opt_out","display_name") WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
