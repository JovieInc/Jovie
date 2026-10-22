ALTER TABLE "stripe_webhook_events" ADD COLUMN "reconciliation_status" text;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN "reconciliation_reason" text;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN "reconciliation_context" jsonb;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN "reconciliation_flagged_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN "reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_reconciliation_status_check" CHECK ("stripe_webhook_events"."reconciliation_status" IS NULL OR "stripe_webhook_events"."reconciliation_status" IN ('needs_reconciliation', 'reconciled'));