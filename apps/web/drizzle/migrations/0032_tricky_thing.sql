ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_converted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_notifications_sent" integer DEFAULT 0;