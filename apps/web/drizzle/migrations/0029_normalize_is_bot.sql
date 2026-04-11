-- Wave 4a: Normalize click_events.is_bot to NOT NULL (online-safe)
--
-- Strategy: use CHECK NOT VALID + VALIDATE to avoid ACCESS EXCLUSIVE lock
-- during the full table scan for NOT NULL enforcement.

-- 1. Backfill existing NULLs to false
UPDATE "click_events" SET "is_bot" = false WHERE "is_bot" IS NULL;--> statement-breakpoint

-- 2. Add NOT NULL via NOT VALID constraint (instant, no scan)
ALTER TABLE "click_events" ADD CONSTRAINT click_events_is_bot_not_null
  CHECK ("is_bot" IS NOT NULL) NOT VALID;--> statement-breakpoint

-- 3. Validate constraint (ShareUpdateExclusiveLock — allows reads+writes)
ALTER TABLE "click_events" VALIDATE CONSTRAINT click_events_is_bot_not_null;--> statement-breakpoint

-- 4. Now SET NOT NULL is instant because PG12+ sees the validated constraint
ALTER TABLE "click_events" ALTER COLUMN "is_bot" SET NOT NULL;--> statement-breakpoint

-- 5. Drop the helper constraint (no longer needed)
ALTER TABLE "click_events" DROP CONSTRAINT click_events_is_bot_not_null;--> statement-breakpoint

-- 6. Rebuild partial index with simplified predicate (drop OR is_bot IS NULL)
DROP INDEX IF EXISTS "idx_click_events_non_bot";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_non_bot" ON "click_events" USING btree ("creator_profile_id","created_at") WHERE is_bot = false;
