DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'product_funnel_event_type'
      AND t.typtype = 'e'
  ) THEN
    CREATE TYPE "public"."product_funnel_event_type" AS ENUM('visit', 'signup_started', 'signup_completed', 'email_verified', 'onboarding_started', 'onboarding_completed', 'activated', 'checkout_started', 'payment_succeeded', 'retained_day_1', 'retained_day_7', 'app_session');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'product_funnel_alert_status'
      AND t.typtype = 'e'
  ) THEN
    CREATE TYPE "public"."product_funnel_alert_status" AS ENUM('ok', 'alerting');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'product_synthetic_run_status'
      AND t.typtype = 'e'
  ) THEN
    CREATE TYPE "public"."product_synthetic_run_status" AS ENUM('running', 'success', 'failure', 'skipped');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "product_funnel_alert_states" (
	"rule_name" text PRIMARY KEY NOT NULL,
	"status" "product_funnel_alert_status" DEFAULT 'ok' NOT NULL,
	"last_evaluated_at" timestamp,
	"last_triggered_at" timestamp,
	"last_recovered_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "product_funnel_event_type" NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"actor_key" text NOT NULL,
	"user_id" uuid,
	"creator_profile_id" uuid,
	"session_id" text,
	"source_surface" text,
	"source_route" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_synthetic_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_key" text NOT NULL,
	"status" "product_synthetic_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_funnel_events" ADD CONSTRAINT "product_funnel_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_funnel_events" ADD CONSTRAINT "product_funnel_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_funnel_events_idempotency_key_unique" ON "product_funnel_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_funnel_events_event_occurred_at_idx" ON "product_funnel_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_funnel_events_event_synthetic_occurred_at_idx" ON "product_funnel_events" USING btree ("event_type","is_synthetic","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_funnel_events_user_id_idx" ON "product_funnel_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_funnel_events_creator_profile_id_idx" ON "product_funnel_events" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_funnel_events_session_id_idx" ON "product_funnel_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_synthetic_runs_monitor_started_at_idx" ON "product_synthetic_runs" USING btree ("monitor_key","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_synthetic_runs_status_started_at_idx" ON "product_synthetic_runs" USING btree ("status","started_at");
