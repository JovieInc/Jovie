DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retouch_job_status') THEN
    CREATE TYPE "public"."retouch_job_status" AS ENUM('queued', 'running', 'identity_check_failed', 'identity_check_retrying', 'completed', 'failed', 'rejected_by_user', 'accepted_by_user');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_kind') THEN
    CREATE TYPE "public"."skill_kind" AS ENUM('vertical_agent', 'tool', 'style');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retouch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_asset_id" text NOT NULL,
	"result_asset_id" text,
	"style" text DEFAULT 'white-space' NOT NULL,
	"style_version" text NOT NULL,
	"per_image_override" text,
	"model" text NOT NULL,
	"status" "retouch_job_status" DEFAULT 'queued' NOT NULL,
	"identity_score" numeric(4, 3),
	"token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"error" text,
	"chat_thread_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "skill_kind" NOT NULL,
	"version" text NOT NULL,
	"entitlement_required" text,
	"model" text,
	"prompt_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tools_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "skill_kind" DEFAULT 'tool' NOT NULL,
	"version" text NOT NULL,
	"entitlement_required" text,
	"model" text,
	"prompt_path" text,
	"input_schema_zod_path" text,
	"output_schema_zod_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_catalog_kind_check'
      AND conrelid = 'public.skills_catalog'::regclass
  ) THEN
    ALTER TABLE "skills_catalog" ADD CONSTRAINT "skills_catalog_kind_check" CHECK ("kind" IN ('vertical_agent', 'style'));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tools_catalog_kind_check'
      AND conrelid = 'public.tools_catalog'::regclass
  ) THEN
    ALTER TABLE "tools_catalog" ADD CONSTRAINT "tools_catalog_kind_check" CHECK ("kind" = 'tool');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retouch_jobs_identity_score_range_check'
      AND conrelid = 'public.retouch_jobs'::regclass
  ) THEN
    ALTER TABLE "retouch_jobs" ADD CONSTRAINT "retouch_jobs_identity_score_range_check" CHECK ("identity_score" IS NULL OR ("identity_score" >= -1 AND "identity_score" <= 1));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retouch_jobs_cost_non_negative_check'
      AND conrelid = 'public.retouch_jobs'::regclass
  ) THEN
    ALTER TABLE "retouch_jobs" ADD CONSTRAINT "retouch_jobs_cost_non_negative_check" CHECK ("cost" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retouch_jobs_user_id_users_id_fk'
      AND conrelid = 'public.retouch_jobs'::regclass
  ) THEN
    ALTER TABLE "retouch_jobs" ADD CONSTRAINT "retouch_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retouch_jobs_user_status_idx" ON "retouch_jobs" USING btree ("user_id","status","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retouch_jobs_status_started_idx" ON "retouch_jobs" USING btree ("status","started_at");
