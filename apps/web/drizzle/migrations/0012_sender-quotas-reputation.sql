DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_status') THEN
    CREATE TYPE "public"."sender_status" AS ENUM('good', 'warning', 'probation', 'suspended', 'banned');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE "public"."ticket_status" AS ENUM('available', 'sold_out', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_date_provider') THEN
    CREATE TYPE "public"."tour_date_provider" AS ENUM('bandsintown', 'songkick', 'manual');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_email_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"daily_sent" integer DEFAULT 0 NOT NULL,
	"monthly_sent" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 1000 NOT NULL,
	"monthly_limit" integer DEFAULT 25000 NOT NULL,
	"daily_reset_at" timestamp NOT NULL,
	"monthly_reset_at" timestamp NOT NULL,
	"has_custom_limits" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_email_quotas_creator_profile_id_unique" UNIQUE("creator_profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_sending_reputation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_complaints" integer DEFAULT 0 NOT NULL,
	"recent_sent" integer DEFAULT 0 NOT NULL,
	"recent_bounced" integer DEFAULT 0 NOT NULL,
	"recent_complaints" integer DEFAULT 0 NOT NULL,
	"bounce_rate" real DEFAULT 0 NOT NULL,
	"complaint_rate" real DEFAULT 0 NOT NULL,
	"status" "sender_status" DEFAULT 'good' NOT NULL,
	"suspended_at" timestamp,
	"suspended_until" timestamp,
	"suspension_reason" text,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"last_warning_at" timestamp,
	"rolling_window_reset_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_sending_reputation_creator_profile_id_unique" UNIQUE("creator_profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_send_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_message_id" text NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"email_type" text NOT NULL,
	"reference_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tour_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"external_id" text,
	"provider" "tour_date_provider" DEFAULT 'manual' NOT NULL,
	"title" text,
	"start_date" timestamp with time zone NOT NULL,
	"start_time" text,
	"venue_name" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"country" text NOT NULL,
	"latitude" real,
	"longitude" real,
	"ticket_url" text,
	"ticket_status" "ticket_status" DEFAULT 'available' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "bandsintown_artist_name" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'creator_email_quotas_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "creator_email_quotas" ADD CONSTRAINT "creator_email_quotas_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'creator_sending_reputation_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "creator_sending_reputation" ADD CONSTRAINT "creator_sending_reputation_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'email_send_attribution_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "email_send_attribution" ADD CONSTRAINT "email_send_attribution_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tour_dates_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "tour_dates" ADD CONSTRAINT "tour_dates_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_creator_profile_id_idx" ON "creator_email_quotas" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_daily_reset_idx" ON "creator_email_quotas" USING btree ("daily_reset_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_monthly_reset_idx" ON "creator_email_quotas" USING btree ("monthly_reset_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_creator_profile_id_idx" ON "creator_sending_reputation" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_status_idx" ON "creator_sending_reputation" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_bounce_rate_idx" ON "creator_sending_reputation" USING btree ("bounce_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_complaint_rate_idx" ON "creator_sending_reputation" USING btree ("complaint_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_rolling_window_reset_idx" ON "creator_sending_reputation" USING btree ("rolling_window_reset_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_attribution_provider_message_id_idx" ON "email_send_attribution" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_send_attribution_creator_profile_id_idx" ON "email_send_attribution" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_send_attribution_expires_at_idx" ON "email_send_attribution" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tour_dates_profile_id" ON "tour_dates" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tour_dates_start_date" ON "tour_dates" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tour_dates_external_id_provider" ON "tour_dates" USING btree ("profile_id","external_id","provider");
