-- #11462: per-workflow model A/B bake-off + cost-aware auto-promotion.
-- Experiment config (one row per workflow), per-request usage/cost log,
-- and an append-only promotions audit trail.

CREATE TABLE IF NOT EXISTS "model_experiments" (
  "workflow" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "candidates" jsonb NOT NULL,
  "promoted_model" text,
  "feedback_tool_name" text,
  "min_votes_per_arm" integer DEFAULT 30 NOT NULL,
  "cost_tolerance" double precision DEFAULT 0.05 NOT NULL,
  "updated_by" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_experiments_status_idx"
  ON "model_experiments" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "model_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer,
  "cost_usd" double precision,
  "request_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_usage_events_workflow_model_idx"
  ON "model_usage_events" ("workflow", "model", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "model_promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow" text NOT NULL,
  "from_model" text NOT NULL,
  "to_model" text,
  "action" text NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor" text DEFAULT 'cron' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_promotions_workflow_idx"
  ON "model_promotions" ("workflow", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_promotions_created_idx"
  ON "model_promotions" ("created_at");
