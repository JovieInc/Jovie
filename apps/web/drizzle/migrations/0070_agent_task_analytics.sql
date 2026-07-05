-- #12140 / #12144 / #12145: agent-task analytics batch.
-- Opportunity lifecycle timestamps, workflow-level step result log, and
-- manual-vs-automated release-cycle step classification.

-- #12140: opportunity lifecycle start. Backfill existing rows as created_at
-- (labeled assumption per issue acceptance).
ALTER TABLE "suggested_actions" ADD COLUMN IF NOT EXISTS "detected_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "suggested_actions" SET "detected_at" = "created_at" WHERE "detected_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "suggested_actions" ALTER COLUMN "detected_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "suggested_actions" ALTER COLUMN "detected_at" SET NOT NULL;
--> statement-breakpoint

-- #12140: opportunity lifecycle end (set when a run reaches completed).
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp with time zone;
--> statement-breakpoint

-- #12145: workflow-level result log.
CREATE TABLE IF NOT EXISTS "workflow_step_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "step" text NOT NULL,
  "agent" text NOT NULL,
  "status" text NOT NULL,
  "tokens_in" integer,
  "tokens_out" integer,
  "cost_usd" numeric(12, 6),
  "latency_ms" integer,
  "linked_opportunity_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_step_results_run_id_workflow_runs_id_fk'
  ) THEN
    ALTER TABLE "workflow_step_results"
      ADD CONSTRAINT "workflow_step_results_run_id_workflow_runs_id_fk"
      FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_step_results_linked_opportunity_id_fk'
  ) THEN
    ALTER TABLE "workflow_step_results"
      ADD CONSTRAINT "workflow_step_results_linked_opportunity_id_fk"
      FOREIGN KEY ("linked_opportunity_id") REFERENCES "public"."suggested_actions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_results_agent_created_idx"
  ON "workflow_step_results" ("agent", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_results_run_id_idx"
  ON "workflow_step_results" ("run_id");
--> statement-breakpoint

-- #12144: manual-vs-automated release-cycle step classification.
CREATE TABLE IF NOT EXISTS "release_cycle_step_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "release_id" text NOT NULL,
  "step" text NOT NULL,
  "source" text NOT NULL,
  "workflow_run_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'release_cycle_step_events_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "release_cycle_step_events"
      ADD CONSTRAINT "release_cycle_step_events_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'release_cycle_step_events_workflow_run_id_workflow_runs_id_fk'
  ) THEN
    ALTER TABLE "release_cycle_step_events"
      ADD CONSTRAINT "release_cycle_step_events_workflow_run_id_workflow_runs_id_fk"
      FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_cycle_step_events_user_release_idx"
  ON "release_cycle_step_events" ("user_id", "release_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_cycle_step_events_release_step_uniq"
  ON "release_cycle_step_events" ("release_id", "step");
-- gate-evidence re-run trigger
