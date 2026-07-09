CREATE TABLE IF NOT EXISTS "artist_revenue_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"cohort" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"match_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"baseline_window_start" timestamp with time zone NOT NULL,
	"baseline_window_end" timestamp with time zone NOT NULL,
	"baseline_gmv_cents" integer DEFAULT 0 NOT NULL,
	"baseline_tips_cents" integer DEFAULT 0 NOT NULL,
	"baseline_dsp_click_count" integer DEFAULT 0 NOT NULL,
	"baseline_new_fan_count" integer DEFAULT 0 NOT NULL,
	"baseline_revenue_signal_cents" integer DEFAULT 0 NOT NULL,
	"baseline_weights_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_revenue_cohorts_cohort_check" CHECK ("cohort" IN ('jovie_active', 'control'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artist_revenue_cohorts_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "artist_revenue_cohorts"
      ADD CONSTRAINT "artist_revenue_cohorts_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artist_revenue_cohorts_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "artist_revenue_cohorts"
      ADD CONSTRAINT "artist_revenue_cohorts_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artist_revenue_cohorts_user_id_uniq" ON "artist_revenue_cohorts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_revenue_cohorts_cohort_assigned_at_idx" ON "artist_revenue_cohorts" USING btree ("cohort","assigned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_revenue_cohorts_creator_profile_id_idx" ON "artist_revenue_cohorts" USING btree ("creator_profile_id");
