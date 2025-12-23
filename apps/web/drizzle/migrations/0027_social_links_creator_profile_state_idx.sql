-- Custom SQL migration file, put your code below! --
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_state_idx" ON "social_links" ("creator_profile_id","state","created_at");
