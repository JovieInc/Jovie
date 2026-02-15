DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_category') THEN
    CREATE TYPE "public"."insight_category" AS ENUM('geographic', 'growth', 'content', 'revenue', 'tour', 'platform', 'engagement', 'timing');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_priority') THEN
    CREATE TYPE "public"."insight_priority" AS ENUM('high', 'medium', 'low');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_run_status') THEN
    CREATE TYPE "public"."insight_run_status" AS ENUM('pending', 'processing', 'completed', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_status') THEN
    CREATE TYPE "public"."insight_status" AS ENUM('active', 'dismissed', 'acted_on', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_type') THEN
    CREATE TYPE "public"."insight_type" AS ENUM('city_growth', 'new_market', 'declining_market', 'tour_gap', 'tour_timing', 'subscriber_surge', 'subscriber_churn', 'release_momentum', 'platform_preference', 'referrer_surge', 'tip_hotspot', 'engagement_quality', 'peak_activity', 'capture_rate_change', 'device_shift');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"insight_type" "insight_type" NOT NULL,
	"category" "insight_category" NOT NULL,
	"priority" "insight_priority" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"action_suggestion" text,
	"confidence" numeric(3, 2) NOT NULL,
	"data_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"comparison_period_start" timestamp with time zone,
	"comparison_period_end" timestamp with time zone,
	"status" "insight_status" DEFAULT 'active' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"generation_run_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"status" "insight_run_status" DEFAULT 'pending' NOT NULL,
	"insights_generated" integer DEFAULT 0 NOT NULL,
	"data_points_analyzed" integer DEFAULT 0 NOT NULL,
	"model_used" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_members" ADD COLUMN "utm_params" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "confirmation_token" text;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN "confirmation_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "growth_access_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "growth_access_reason" text;--> statement-breakpoint
ALTER TABLE "tour_dates" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_generation_run_id_insight_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."insight_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_generation_runs" ADD CONSTRAINT "insight_generation_runs_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_creator_active" ON "ai_insights" USING btree ("creator_profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_expires_at" ON "ai_insights" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_creator_priority" ON "ai_insights" USING btree ("creator_profile_id","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_insights_dedup" ON "ai_insights" USING btree ("creator_profile_id","insight_type","period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_insight_runs_creator" ON "insight_generation_runs" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_insight_runs_status" ON "insight_generation_runs" USING btree ("status");
