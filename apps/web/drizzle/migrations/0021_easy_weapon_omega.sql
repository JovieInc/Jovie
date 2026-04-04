DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'task_agent_status'
	) THEN
		CREATE TYPE "public"."task_agent_status" AS ENUM('idle', 'queued', 'drafting', 'awaiting_review', 'approved', 'failed');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'task_assignee_kind'
	) THEN
		CREATE TYPE "public"."task_assignee_kind" AS ENUM('human', 'jovie');
	END IF;
END $$;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_number" integer NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "release_task_status" DEFAULT 'todo' NOT NULL,
	"priority" "release_task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_kind" "task_assignee_kind" DEFAULT 'human' NOT NULL,
	"assignee_user_id" text,
	"agent_type" text,
	"agent_status" "task_agent_status" DEFAULT 'idle' NOT NULL,
	"agent_input" jsonb DEFAULT '{}'::jsonb,
	"agent_output" jsonb DEFAULT '{}'::jsonb,
	"agent_error" text,
	"release_id" uuid,
	"parent_task_id" uuid,
	"category" text,
	"due_at" timestamp,
	"scheduled_for" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"source_template_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "next_task_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_template_id_release_task_template_items_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."release_task_template_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_creator_task_number_unique" ON "tasks" USING btree ("creator_profile_id","task_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_status_priority_due_idx" ON "tasks" USING btree ("creator_profile_id","status","priority","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_position_idx" ON "tasks" USING btree ("creator_profile_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_release_idx" ON "tasks" USING btree ("release_id") WHERE release_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_agent_status_idx" ON "tasks" USING btree ("creator_profile_id","agent_status") WHERE deleted_at IS NULL;
--> statement-breakpoint
WITH ordered_release_tasks AS (
	SELECT
		rt.id,
		row_number() OVER (
			PARTITION BY rt.creator_profile_id
			ORDER BY rt.created_at, rt.position, rt.id
		) AS task_number,
		rt.creator_profile_id,
		rt.title,
		rt.description,
		rt.status,
		rt.priority,
		CASE
			WHEN rt.assignee_type = 'ai_workflow' THEN 'jovie'::task_assignee_kind
			ELSE 'human'::task_assignee_kind
		END AS assignee_kind,
		rt.assignee_user_id,
		rt.ai_workflow_id,
		rt.release_id,
		rt.category,
		rt.due_date,
		rt.completed_at,
		rt.position,
		rt.template_item_id,
		rt.created_at,
		rt.updated_at,
		jsonb_build_object(
			'dueDaysOffset', rt.due_days_offset,
			'explainerText', rt.explainer_text,
			'learnMoreUrl', rt.learn_more_url,
			'videoUrl', rt.video_url
		) AS metadata
	FROM release_tasks rt
)
INSERT INTO tasks (
	id,
	task_number,
	creator_profile_id,
	title,
	description,
	status,
	priority,
	assignee_kind,
	assignee_user_id,
	agent_type,
	agent_status,
	release_id,
	category,
	due_at,
	completed_at,
	position,
	source_template_id,
	metadata,
	created_at,
	updated_at
)
SELECT
	id,
	task_number,
	creator_profile_id,
	title,
	description,
	status,
	priority,
	assignee_kind,
	assignee_user_id,
	ai_workflow_id,
	'idle'::task_agent_status,
	release_id,
	category,
	due_date,
	completed_at,
	position,
	template_item_id,
	metadata,
	created_at,
	updated_at
FROM ordered_release_tasks;
--> statement-breakpoint
UPDATE creator_profiles cp
SET next_task_number = COALESCE(task_counts.max_task_number + 1, 1)
FROM (
	SELECT creator_profile_id, MAX(task_number) AS max_task_number
	FROM tasks
	GROUP BY creator_profile_id
) AS task_counts
WHERE cp.id = task_counts.creator_profile_id;
