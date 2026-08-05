-- JOV-3948: server-managed per-skill rollout configuration and sticky assignments.

ALTER TABLE "skills_catalog"
  ADD COLUMN IF NOT EXISTS "rollout" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_rollout_assignments" (
  "skill_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "cohort" text NOT NULL,
  "skill_version" text NOT NULL,
  "bucket" integer NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "skill_rollout_assignments_pk" PRIMARY KEY ("skill_id", "user_id"),
  CONSTRAINT "skill_rollout_assignments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_rollout_assignments_user_id_idx"
  ON "skill_rollout_assignments" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_run_events_cohort_idx"
  ON "skill_run_events" ((metadata->>'cohort'), skill_id, started_at);
