ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_lease_expires_at_idx" ON "workflow_runs" USING btree ("lease_expires_at");