-- Release Task Management System
-- Three enums + three tables for release campaign task tracking

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_status') THEN
    CREATE TYPE "release_task_status" AS ENUM ('backlog', 'todo', 'in_progress', 'done', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_priority') THEN
    CREATE TYPE "release_task_priority" AS ENUM ('urgent', 'high', 'medium', 'low', 'none');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_assignee_type') THEN
    CREATE TYPE "release_task_assignee_type" AS ENUM ('human', 'ai_workflow');
  END IF;
END $$;

-- Release Task Templates (per-artist customizable, Phase 2)
CREATE TABLE IF NOT EXISTS "release_task_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "creator_profile_id" uuid REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "release_task_templates_creator_default_unique"
  ON "release_task_templates" ("creator_profile_id")
  WHERE is_default = true;

-- Release Task Template Items (the ~20+ line items in a template)
CREATE TABLE IF NOT EXISTS "release_task_template_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_id" uuid NOT NULL REFERENCES "release_task_templates"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "explainer_text" text,
  "learn_more_url" text,
  "video_url" text,
  "category" text NOT NULL,
  "default_assignee_type" "release_task_assignee_type" NOT NULL DEFAULT 'human',
  "default_ai_workflow_id" text,
  "default_priority" "release_task_priority" NOT NULL DEFAULT 'medium',
  "default_due_days_offset" integer,
  "position" integer NOT NULL DEFAULT 0,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "release_task_template_items_template_id_idx"
  ON "release_task_template_items" ("template_id");

-- Release Tasks (instantiated per release)
CREATE TABLE IF NOT EXISTS "release_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "release_id" uuid NOT NULL REFERENCES "discog_releases"("id") ON DELETE CASCADE,
  "creator_profile_id" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE CASCADE,
  "template_item_id" uuid REFERENCES "release_task_template_items"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "explainer_text" text,
  "learn_more_url" text,
  "video_url" text,
  "category" text,
  "status" "release_task_status" NOT NULL DEFAULT 'todo',
  "priority" "release_task_priority" NOT NULL DEFAULT 'medium',
  "position" integer NOT NULL DEFAULT 0,
  "assignee_type" "release_task_assignee_type" NOT NULL DEFAULT 'human',
  "assignee_user_id" text,
  "ai_workflow_id" text,
  "due_days_offset" integer,
  "due_date" timestamp,
  "completed_at" timestamp,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "release_tasks_release_status_idx"
  ON "release_tasks" ("release_id", "status");
CREATE INDEX IF NOT EXISTS "release_tasks_release_position_idx"
  ON "release_tasks" ("release_id", "position");
CREATE INDEX IF NOT EXISTS "release_tasks_creator_profile_idx"
  ON "release_tasks" ("creator_profile_id");
CREATE INDEX IF NOT EXISTS "release_tasks_due_date_idx"
  ON "release_tasks" ("due_date")
  WHERE due_date IS NOT NULL;
