-- Custom SQL migration file, put your code below! --
-- Composite index for analytics queries that filter by creator, exclude bot traffic, and filter by date
-- Query pattern: WHERE creator_profile_id = ? AND (is_bot = false OR is_bot IS NULL) AND created_at >= ?
CREATE INDEX IF NOT EXISTS "click_events_creator_profile_id_is_bot_created_at_idx" ON "click_events" ("creator_profile_id","is_bot","created_at");
