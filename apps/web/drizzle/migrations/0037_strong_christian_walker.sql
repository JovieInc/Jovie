DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custom_task_triage_status') THEN
    CREATE TYPE "public"."custom_task_triage_status" AS
      ENUM('auto_clustered', 'pending_review', 'merged_to_catalog', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_child_type') THEN
    CREATE TYPE "public"."release_child_type" AS
      ENUM('spedup', 'slowed', 'clean', 'radio_edit', 'extended', 'instrumental', 'lyric_video');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_skill_cluster_status') THEN
    CREATE TYPE "public"."release_skill_cluster_status" AS
      ENUM('planned', 'shipping', 'shipped');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_ai_skill_status') THEN
    CREATE TYPE "public"."release_task_ai_skill_status" AS
      ENUM('none', 'planned', 'in_progress', 'shipped');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "custom_task_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid,
	"creator_profile_id" uuid,
	"user_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"suggested_cluster_slug" text,
	"classifier_confidence" real,
	"triage_status" "custom_task_triage_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_skill_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" "release_skill_cluster_status" DEFAULT 'planned' NOT NULL,
	"demand_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "release_skill_clusters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "release_task_catalog" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"cluster_id" integer,
	"short_description" text,
	"priority" "release_task_priority" DEFAULT 'medium' NOT NULL,
	"flow_stage_days_offset" integer,
	"dependencies" text[],
	"applicability_rules" jsonb NOT NULL,
	"applicability_rules_version" integer DEFAULT 1 NOT NULL,
	"platforms" jsonb DEFAULT '{}'::jsonb,
	"source_links" jsonb DEFAULT '{}'::jsonb,
	"assignee_type" "release_task_assignee_type" DEFAULT 'human' NOT NULL,
	"ai_skill_status" "release_task_ai_skill_status" DEFAULT 'none' NOT NULL,
	"ai_skill_id" text,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_task_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"catalog_slug" text NOT NULL,
	"catalog_version" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"cluster_id" integer,
	"short_description" text,
	"priority" "release_task_priority" DEFAULT 'medium' NOT NULL,
	"flow_stage_days_offset" integer,
	"assignee_type" "release_task_assignee_type" DEFAULT 'human' NOT NULL,
	"ai_skill_id" text,
	"ai_skill_status" "release_task_ai_skill_status" DEFAULT 'none' NOT NULL,
	"reasons" text[],
	"score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_task_telemetry" ADD CONSTRAINT "custom_task_telemetry_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_task_telemetry" ADD CONSTRAINT "custom_task_telemetry_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_task_catalog" ADD CONSTRAINT "release_task_catalog_cluster_id_release_skill_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."release_skill_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_task_snapshots" ADD CONSTRAINT "release_task_snapshots_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_task_telemetry_triage_status_idx" ON "custom_task_telemetry" USING btree ("triage_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_task_telemetry_normalized_text_idx" ON "custom_task_telemetry" USING btree ("normalized_text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_task_catalog_cluster_id_idx" ON "release_task_catalog" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_task_snapshots_release_id_idx" ON "release_task_snapshots" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_task_snapshots_release_catalog_slug_unique" ON "release_task_snapshots" USING btree ("release_id","catalog_slug");
