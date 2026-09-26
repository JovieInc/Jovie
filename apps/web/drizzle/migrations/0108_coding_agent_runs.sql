DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coding_agent_cost_source') THEN
    CREATE TYPE "public"."coding_agent_cost_source" AS ENUM('actual', 'estimated');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coding_agent_outcome') THEN
    CREATE TYPE "public"."coding_agent_outcome" AS ENUM('open', 'landed', 'reverted', 'failed', 'abandoned');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coding_agent_source') THEN
    CREATE TYPE "public"."coding_agent_source" AS ENUM('hyperagent', 'devin', 'cursor', 'grokbot', 'manual');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coding_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "coding_agent_source" NOT NULL,
	"source_run_id" text NOT NULL,
	"session_url" text,
	"agent_id" text,
	"agent_name" text,
	"model_name" text,
	"cost_usd" numeric(10, 4),
	"cost_source" "coding_agent_cost_source" NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"tools_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prompt_digest" text,
	"diff_stats" jsonb,
	"pr_url" text,
	"pr_number" integer,
	"ci_result" jsonb,
	"merge_timestamp" timestamp with time zone,
	"outcome_label" "coding_agent_outcome" DEFAULT 'open' NOT NULL,
	"revert_link" text,
	"post_land_incidents" text[] DEFAULT '{}' NOT NULL,
	"linear_issue_id" text,
	"notes" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coding_agent_runs_source_run_idx" ON "coding_agent_runs" USING btree ("source","source_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coding_agent_runs_outcome_merge_idx" ON "coding_agent_runs" USING btree ("outcome_label","merge_timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coding_agent_runs_model_idx" ON "coding_agent_runs" USING btree ("source","model_name");--> statement-breakpoint
-- Actual landed cost only. Estimated or unknown costs are not a zero.
CREATE OR REPLACE VIEW "cost_per_landed_pr" AS
SELECT
  "source",
  "model_name",
  COUNT(*) FILTER (WHERE outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL) AS "landed_count",
  SUM("cost_usd") FILTER (
    WHERE outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL
  ) AS "actual_cost_usd_landed",
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL) = 0 THEN NULL
    ELSE SUM("cost_usd") FILTER (
      WHERE outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL
    ) / COUNT(*) FILTER (WHERE outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL)
  END AS "cost_per_landed_pr_usd"
FROM "coding_agent_runs"
GROUP BY "source", "model_name";