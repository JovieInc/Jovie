-- Add music_collaboration to contact_role enum
ALTER TYPE "contact_role" ADD VALUE IF NOT EXISTS 'music_collaboration';
--> statement-breakpoint

-- Add usernameLockedAt to creator_profiles
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "username_locked_at" timestamp;
--> statement-breakpoint

-- Add inbox routing columns to creator_contacts
ALTER TABLE "creator_contacts" ADD COLUMN IF NOT EXISTS "forward_inbox_emails" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "creator_contacts" ADD COLUMN IF NOT EXISTS "auto_mark_read" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Create inbox enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_email_category') THEN
    CREATE TYPE "inbox_email_category" AS ENUM ('booking', 'music_collaboration', 'brand_partnership', 'management', 'fan_mail', 'personal', 'press', 'business', 'spam', 'other');
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_thread_priority') THEN
    CREATE TYPE "inbox_thread_priority" AS ENUM ('high', 'medium', 'low');
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_thread_status') THEN
    CREATE TYPE "inbox_thread_status" AS ENUM ('pending_review', 'routed', 'routing_failed', 'in_progress', 'resolved', 'archived');
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_outbound_sent_by') THEN
    CREATE TYPE "inbox_outbound_sent_by" AS ENUM ('jovie_routing');
  END IF;
END $$;
--> statement-breakpoint

-- Create email_threads table
CREATE TABLE IF NOT EXISTS "email_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "subject" text,
  "category" "inbox_email_category",
  "suggested_category" "inbox_email_category",
  "suggested_territory" text,
  "category_confidence" real,
  "territory" text,
  "priority" "inbox_thread_priority" DEFAULT 'medium',
  "status" "inbox_thread_status" NOT NULL DEFAULT 'pending_review',
  "routed_to_contact_id" uuid REFERENCES "creator_contacts"("id") ON DELETE SET NULL,
  "routed_at" timestamp,
  "ai_summary" text,
  "ai_extracted_data" jsonb,
  "latest_message_at" timestamp NOT NULL DEFAULT now(),
  "message_count" integer NOT NULL DEFAULT 1,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Create inbound_emails table
CREATE TABLE IF NOT EXISTS "inbound_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid REFERENCES "email_threads"("id") ON DELETE SET NULL,
  "message_id" text,
  "in_reply_to" text,
  "references" jsonb DEFAULT '[]',
  "from_email" text NOT NULL,
  "from_name" text,
  "to_email" text NOT NULL,
  "cc_emails" jsonb DEFAULT '[]',
  "subject" text,
  "body_text" text,
  "body_html" text,
  "stripped_text" text,
  "attachments" jsonb DEFAULT '[]',
  "raw_headers" jsonb,
  "resend_email_id" text,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Create outbound_replies table
CREATE TABLE IF NOT EXISTS "outbound_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "email_threads"("id") ON DELETE CASCADE,
  "in_reply_to_message_id" text,
  "to_email" text NOT NULL,
  "cc_emails" jsonb DEFAULT '[]',
  "subject" text,
  "body_text" text NOT NULL,
  "body_html" text,
  "sent_by" "inbox_outbound_sent_by" NOT NULL,
  "resend_message_id" text,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_profile_received" ON "inbound_emails" ("creator_profile_id", "received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_thread" ON "inbound_emails" ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_message_id" ON "inbound_emails" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_from_email" ON "inbound_emails" ("from_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_profile_status" ON "email_threads" ("creator_profile_id", "status", "latest_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_profile_category" ON "email_threads" ("creator_profile_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_latest_message" ON "email_threads" ("latest_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbound_replies_thread" ON "outbound_replies" ("thread_id", "sent_at");
