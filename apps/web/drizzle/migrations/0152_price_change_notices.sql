CREATE TABLE IF NOT EXISTS "price_change_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"bounce_retries" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"provider_message_id" text,
	"content_hash" text,
	"template_version" text,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"sent_at" timestamp,
	"last_error" text,
	"fallback_notice_at" timestamp,
	"applied_at" timestamp,
	"applied_stripe_price_id" text,
	"apply_error" text,
	CONSTRAINT "price_change_notices_status_check" CHECK ("price_change_notices"."status" IN ('queued', 'sending', 'sent', 'bounced', 'failed', 'permanent_bounce', 'no_recipient'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_price_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"price_key" text NOT NULL,
	"plan_name" text NOT NULL,
	"old_amount_cents" integer NOT NULL,
	"new_amount_cents" integer NOT NULL,
	"effective_at" timestamp NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"fully_notified_at" timestamp,
	"held_at" timestamp,
	"incident_filed_at" timestamp,
	"applied_at" timestamp,
	"last_sweep_at" timestamp,
	CONSTRAINT "scheduled_price_changes_status_check" CHECK ("scheduled_price_changes"."status" IN ('scheduled', 'notifying', 'fully_notified', 'held', 'applied', 'cancelled'))
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_change_notices_change_id_scheduled_price_changes_id_fk') THEN
    ALTER TABLE "price_change_notices" ADD CONSTRAINT "price_change_notices_change_id_scheduled_price_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."scheduled_price_changes"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_change_notices_user_id_users_id_fk') THEN
    ALTER TABLE "price_change_notices" ADD CONSTRAINT "price_change_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_change_notices_change_subscription_idx" ON "price_change_notices" USING btree ("change_id","subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_change_notices_status_idx" ON "price_change_notices" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_change_notices_provider_message_idx" ON "price_change_notices" USING btree ("provider_message_id");