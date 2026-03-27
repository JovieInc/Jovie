DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'lead_attribution_status'
	) THEN
		CREATE TYPE "public"."lead_attribution_status" AS ENUM('unattributed', 'attributed', 'expired');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'lead_ramp_mode'
	) THEN
		CREATE TYPE "public"."lead_ramp_mode" AS ENUM('manual', 'recommend_only');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'lead_source_platform'
	) THEN
		CREATE TYPE "public"."lead_source_platform" AS ENUM('linktree', 'beacons', 'laylo');
	END IF;
END $$;--> statement-breakpoint
CREATE TABLE "lead_funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" text,
	"provider" text,
	"campaign_key" text,
	"variant_key" text,
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"normalized_result_url" text NOT NULL,
	"source_platform" "lead_source_platform" DEFAULT 'linktree' NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"times_seen" integer DEFAULT 1 NOT NULL,
	"last_rank" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_pipeline_settings" ADD COLUMN "daily_send_cap" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pipeline_settings" ADD COLUMN "max_per_hour" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pipeline_settings" ADD COLUMN "ramp_mode" "lead_ramp_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pipeline_settings" ADD COLUMN "guardrails_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pipeline_settings" ADD COLUMN "guardrail_thresholds" jsonb DEFAULT '{"minimumSampleSize":30,"increaseClaimClickRate":0.06,"holdClaimClickRateFloor":0.03,"pauseClaimClickRateFloor":0.03,"maxBounceComplaintRate":0.03,"maxUnsubscribeRate":0.05,"maxProviderFailureRate":0.1}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_platform" "lead_source_platform" DEFAULT 'linktree' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_handle" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "has_tracking_pixels" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tracking_pixel_platforms" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signal_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "first_contacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_contacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signup_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signup_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "paid_subscription_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "attribution_status" "lead_attribution_status" DEFAULT 'unattributed' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_funnel_events" ADD CONSTRAINT "lead_funnel_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_funnel_events_lead_occurred_at" ON "lead_funnel_events" USING btree ("lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_funnel_events_type_occurred_at" ON "lead_funnel_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_lead_search_results_query_url" ON "lead_search_results" USING btree ("query","normalized_result_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_search_results_source_seen" ON "lead_search_results" USING btree ("source_platform","last_seen_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_signup_user_id_users_id_fk" FOREIGN KEY ("signup_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_signup_user_id" ON "leads" USING btree ("signup_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_attribution_status" ON "leads" USING btree ("attribution_status");
