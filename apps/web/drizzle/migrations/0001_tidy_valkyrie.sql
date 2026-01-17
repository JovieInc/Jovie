DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suppression_reason') THEN
    CREATE TYPE "public"."suppression_reason" AS ENUM('hard_bounce', 'soft_bounce', 'spam_complaint', 'invalid_address', 'user_request', 'abuse', 'legal');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"category_key" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_subscription_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"recipient_hash" text NOT NULL,
	"status" "delivery_status" NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unsubscribe_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "audience_members_creator_profile_id_fingerprint_idx";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_suppressions_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_delivery_log_notification_subscription_id_notification_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_notification_subscription_id_notification_subscriptions_id_fk" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."notification_subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_subscriptions_email_hash_idx" ON "category_subscriptions" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_subscriptions_email_hash_category_unique" ON "category_subscriptions" USING btree ("email_hash","category_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_email_hash_idx" ON "email_suppressions" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_hash_reason_unique" ON "email_suppressions" USING btree ("email_hash","reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_expires_at_idx" ON "email_suppressions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_recipient_hash_idx" ON "notification_delivery_log" USING btree ("recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_created_at_idx" ON "notification_delivery_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_subscription_idx" ON "notification_delivery_log" USING btree ("notification_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unsubscribe_tokens_token_hash_idx" ON "unsubscribe_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unsubscribe_tokens_expires_at_idx" ON "unsubscribe_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_unique" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_unprocessed_idx" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_subscriptions_contact_required'
  ) THEN
    ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_contact_required" CHECK ("notification_subscriptions"."email" IS NOT NULL OR "notification_subscriptions"."phone" IS NOT NULL);
  END IF;
END $$;
