ALTER TABLE "workflow_runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
DROP TYPE "public"."workflow_run_status";--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'waiting_for_approval', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "workflow_runs" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."workflow_run_status";--> statement-breakpoint
ALTER TABLE "workflow_runs" ALTER COLUMN "status" SET DATA TYPE "public"."workflow_run_status" USING "status"::"public"."workflow_run_status";--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
CREATE INDEX "fan_release_notifications_campaign_idx" ON "fan_release_notifications" USING btree ("campaign_id");