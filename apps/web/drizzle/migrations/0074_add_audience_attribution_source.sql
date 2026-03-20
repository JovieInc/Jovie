ALTER TABLE "audience_members" ADD COLUMN "attribution_source" text;

-- Retry counter for pixel event forwarding (replaces broken status-counting logic)
ALTER TABLE "pixel_events" ADD COLUMN "retry_count" integer NOT NULL DEFAULT 0;

-- Partial index for the IP purge cron: only indexes rows that still have a raw IP
CREATE INDEX IF NOT EXISTS "idx_pixel_events_purge"
  ON "pixel_events" ("created_at")
  WHERE "client_ip" IS NOT NULL;
