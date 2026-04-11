DROP INDEX "idx_click_events_non_bot";--> statement-breakpoint
ALTER TABLE "click_events" ALTER COLUMN "is_bot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "status" text DEFAULT 'released' NOT NULL;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "reveal_date" timestamp;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_non_bot" ON "click_events" USING btree ("creator_profile_id","created_at") WHERE is_bot = false;