DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_role') THEN
    CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"action" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_sequence_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"current_step" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stop_reason" text,
	"step_completed_at" jsonb DEFAULT '{}'::jsonb,
	"next_step_at" timestamp,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_sequences_campaign_key_unique" UNIQUE("campaign_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_type" text NOT NULL,
	"event_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"provider_message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_avatar_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text,
	"avatar_url" text NOT NULL,
	"confidence_score" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"color_palette" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_profile_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text,
	"display_name" text,
	"bio" text,
	"confidence_score" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_creator_profiles_featured_with_name";--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_campaign_sequence_id_campaign_sequences_id_fk" FOREIGN KEY ("campaign_sequence_id") REFERENCES "public"."campaign_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_avatar_candidates" ADD CONSTRAINT "creator_avatar_candidates_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_attributes" ADD CONSTRAINT "creator_profile_attributes_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_user_id" ON "chat_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_creator_profile_id" ON "chat_audit_log" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_conversation_id" ON "chat_audit_log" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_action" ON "chat_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_created_at" ON "chat_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_user_id" ON "chat_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_creator_profile_id" ON "chat_conversations" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_updated_at" ON "chat_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation_id" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_created_at" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_next_step_idx" ON "campaign_enrollments" USING btree ("next_step_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_campaign_idx" ON "campaign_enrollments" USING btree ("campaign_sequence_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_subject_idx" ON "campaign_enrollments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_status_idx" ON "campaign_enrollments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_enrollments_unique_idx" ON "campaign_enrollments" USING btree ("campaign_sequence_id","subject_id","recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_sequences_campaign_key_idx" ON "campaign_sequences" USING btree ("campaign_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_reference_idx" ON "email_engagement" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_recipient_idx" ON "email_engagement" USING btree ("recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_email_type_idx" ON "email_engagement" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_created_at_idx" ON "email_engagement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_profile_id" ON "creator_avatar_candidates" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_unique" ON "creator_avatar_candidates" USING btree ("creator_profile_id","avatar_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profile_attributes_profile_id" ON "creator_profile_attributes" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_featured_query" ON "creator_profiles" USING btree ("is_public","is_featured","marketing_opt_out","display_name") WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
