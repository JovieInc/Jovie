ALTER TABLE "user_settings" ADD COLUMN "ovie_privacy_lock_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ovie_privacy_lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ovie_privacy_locked_at" timestamp;