ALTER TABLE "admin_system_settings" ADD COLUMN "signup_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD COLUMN "checkout_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD COLUMN "stripe_webhooks_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD COLUMN "cron_fanout_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD COLUMN "operational_controls_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD COLUMN "operational_controls_updated_by" uuid;--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD CONSTRAINT "admin_system_settings_operational_controls_updated_by_users_id_fk" FOREIGN KEY ("operational_controls_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
