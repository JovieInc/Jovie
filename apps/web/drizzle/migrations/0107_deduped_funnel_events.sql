ALTER TABLE "server_analytics_events" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "server_analytics_events_dedupe_key_unique" ON "server_analytics_events" USING btree ("dedupe_key");
