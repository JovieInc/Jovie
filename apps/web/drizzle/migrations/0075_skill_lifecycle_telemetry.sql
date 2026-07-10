-- JOV-3944 / JOV-3946: skill lifecycle + version history + run telemetry.
-- Idempotent additive migration (safe on partially-applied previews).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_lifecycle') THEN
    CREATE TYPE "public"."skill_lifecycle" AS ENUM(
      'draft',
      'dogfood',
      'cohort',
      'ga',
      'deprecated',
      'disabled'
    );
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "skills_catalog"
  ADD COLUMN IF NOT EXISTS "lifecycle" "skill_lifecycle" DEFAULT 'ga' NOT NULL;
--> statement-breakpoint

ALTER TABLE "skills_catalog"
  ADD COLUMN IF NOT EXISTS "active_version" text;
--> statement-breakpoint

UPDATE "skills_catalog"
SET "active_version" = "version"
WHERE "active_version" IS NULL;
--> statement-breakpoint

ALTER TABLE "skills_catalog"
  ALTER COLUMN "active_version" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skills_catalog_lifecycle_idx"
  ON "skills_catalog" ("lifecycle");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skills_catalog_versions" (
  "skill_id" text NOT NULL,
  "version" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "kind" "skill_kind" NOT NULL,
  "lifecycle" "skill_lifecycle" DEFAULT 'draft' NOT NULL,
  "entitlement_required" text,
  "model" text,
  "prompt_path" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "skills_catalog_versions_pk" PRIMARY KEY ("skill_id", "version")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skills_catalog_versions_skill_id_idx"
  ON "skills_catalog_versions" ("skill_id");
--> statement-breakpoint

-- Backfill one version row per existing catalog skill (ga/1.0.0 class).
INSERT INTO "skills_catalog_versions" (
  "skill_id",
  "version",
  "name",
  "description",
  "kind",
  "lifecycle",
  "entitlement_required",
  "model",
  "prompt_path",
  "metadata",
  "created_at"
)
SELECT
  s."id",
  s."version",
  s."name",
  s."description",
  s."kind",
  COALESCE(s."lifecycle", 'ga'::"skill_lifecycle"),
  s."entitlement_required",
  s."model",
  s."prompt_path",
  s."metadata",
  s."created_at"
FROM "skills_catalog" s
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_run_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invocation_id" text NOT NULL,
  "skill_id" text NOT NULL,
  "skill_version" text NOT NULL,
  "user_id" uuid,
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "model" text,
  "token_cost" integer,
  "cost_usd" numeric(12, 6),
  "feedback_vote" text,
  "success_metric_name" text,
  "success_metric_outcome" jsonb,
  "error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skill_run_events_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "skill_run_events"
      ADD CONSTRAINT "skill_run_events_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "skill_run_events_invocation_id_uidx"
  ON "skill_run_events" ("invocation_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_run_events_skill_version_idx"
  ON "skill_run_events" ("skill_id", "skill_version", "started_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_run_events_status_idx"
  ON "skill_run_events" ("status", "started_at");
