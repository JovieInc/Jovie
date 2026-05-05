CREATE TABLE "notification_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"phone_hash" text,
	"email" text,
	"email_hash" text,
	"phone_verified_at" timestamp,
	"email_verified_at" timestamp,
	"sms_consent_at" timestamp,
	"sms_consent_text_hash" text,
	"sms_consent_version" text,
	"sms_status" text DEFAULT 'active' NOT NULL,
	"first_source" text,
	"first_source_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_subscribe_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"visitor_id" text,
	"audience_member_id" uuid,
	"source" text NOT NULL,
	"source_url" text,
	"country_code" text,
	"consent_text_hash" text NOT NULL,
	"consent_version" text NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"fingerprint_hash" text,
	"status" text DEFAULT 'created' NOT NULL,
	"phone" text,
	"provider" text,
	"provider_message_id" text,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "sms_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "sms_consent_text_hash" text;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "sms_consent_version" text;--> statement-breakpoint
ALTER TABLE "sms_subscribe_intents" ADD CONSTRAINT "sms_subscribe_intents_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_subscribe_intents" ADD CONSTRAINT "sms_subscribe_intents_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_contacts_phone_hash_unique" ON "notification_contacts" USING btree ("phone_hash") WHERE "notification_contacts"."phone_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_contacts_email_hash_unique" ON "notification_contacts" USING btree ("email_hash") WHERE "notification_contacts"."email_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_contacts_sms_status_idx" ON "notification_contacts" USING btree ("sms_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_subscribe_intents_code_hash_unique" ON "sms_subscribe_intents" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_subscribe_intents_creator_profile_id_created_at_idx" ON "sms_subscribe_intents" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_subscribe_intents_status_expires_at_idx" ON "sms_subscribe_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_subscribe_intents_active_idx" ON "sms_subscribe_intents" USING btree ("expires_at") WHERE "sms_subscribe_intents"."status" IN ('created', 'sms_received');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_subscribe_intents_visitor_id_idx" ON "sms_subscribe_intents" USING btree ("visitor_id") WHERE "sms_subscribe_intents"."visitor_id" IS NOT NULL;