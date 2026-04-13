ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_converted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_notifications_sent" integer DEFAULT 0;