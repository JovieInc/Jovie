ALTER TABLE "creator_profiles" ADD COLUMN "profile_edit_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_edit_version" ON "creator_profiles" USING btree ("user_id","profile_edit_version");
