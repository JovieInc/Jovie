-- Wave 4a: Normalize click_events.is_bot to NOT NULL
-- Backfill existing NULLs to false, then add constraint
UPDATE "click_events" SET "is_bot" = false WHERE "is_bot" IS NULL;--> statement-breakpoint
ALTER TABLE "click_events" ALTER COLUMN "is_bot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "click_events" ALTER COLUMN "is_bot" SET DEFAULT false;--> statement-breakpoint
-- Rebuild partial index with simplified predicate (drop OR is_bot IS NULL)
DROP INDEX IF EXISTS "idx_click_events_non_bot";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_non_bot" ON "click_events" USING btree ("creator_profile_id","created_at") WHERE is_bot = false;
