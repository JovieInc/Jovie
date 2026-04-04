DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_mismatch_status') THEN CREATE TYPE "public"."catalog_mismatch_status" AS ENUM('flagged', 'confirmed_mismatch', 'dismissed'); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_mismatch_type') THEN CREATE TYPE "public"."catalog_mismatch_type" AS ENUM('not_in_catalog', 'missing_from_dsp'); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_scan_status') THEN CREATE TYPE "public"."catalog_scan_status" AS ENUM('pending', 'running', 'completed', 'failed'); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_agent_status') THEN CREATE TYPE "public"."task_agent_status" AS ENUM('idle', 'queued', 'drafting', 'awaiting_review', 'approved', 'failed'); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_assignee_kind') THEN CREATE TYPE "public"."task_assignee_kind" AS ENUM('human', 'jovie'); END IF; END $$;--> statement-breakpoint
CREATE TABLE "audience_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"audience_member_id" uuid,
	"fingerprint" text NOT NULL,
	"email" text,
	"display_name" text,
	"geo_city" text,
	"geo_country" text,
	"reason" text,
	"blocked_at" timestamp DEFAULT now() NOT NULL,
	"unblocked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "dsp_catalog_mismatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"isrc" text NOT NULL,
	"mismatch_type" "catalog_mismatch_type" NOT NULL,
	"external_track_id" text,
	"external_track_name" text,
	"external_album_name" text,
	"external_album_id" text,
	"external_artwork_url" text,
	"external_artist_names" text,
	"status" "catalog_mismatch_status" DEFAULT 'flagged' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_reason" text,
	"dedup_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsp_catalog_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_artist_id" text NOT NULL,
	"status" "catalog_scan_status" DEFAULT 'pending' NOT NULL,
	"catalog_isrc_count" integer DEFAULT 0 NOT NULL,
	"dsp_isrc_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"coverage_pct" numeric(5, 2),
	"albums_scanned" integer DEFAULT 0 NOT NULL,
	"tracks_scanned" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "audience_blocks" ADD CONSTRAINT "audience_blocks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_blocks" ADD CONSTRAINT "audience_blocks_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_catalog_mismatches" ADD CONSTRAINT "dsp_catalog_mismatches_scan_id_dsp_catalog_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."dsp_catalog_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_catalog_mismatches" ADD CONSTRAINT "dsp_catalog_mismatches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_catalog_scans" ADD CONSTRAINT "dsp_catalog_scans_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_template_id_release_task_template_items_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."release_task_template_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_blocks_profile_fingerprint_active" ON "audience_blocks" USING btree ("creator_profile_id","fingerprint") WHERE unblocked_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audience_blocks_profile_email_active" ON "audience_blocks" USING btree ("creator_profile_id","email") WHERE email IS NOT NULL AND unblocked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dsp_catalog_mismatches_dedup_idx" ON "dsp_catalog_mismatches" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_creator_idx" ON "dsp_catalog_mismatches" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_scan_idx" ON "dsp_catalog_mismatches" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_status_idx" ON "dsp_catalog_mismatches" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_scans_creator_idx" ON "dsp_catalog_scans" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_scans_status_idx" ON "dsp_catalog_scans" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_creator_task_number_unique" ON "tasks" USING btree ("creator_profile_id","task_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_status_priority_due_idx" ON "tasks" USING btree ("creator_profile_id","status","priority","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_position_idx" ON "tasks" USING btree ("creator_profile_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_release_idx" ON "tasks" USING btree ("release_id") WHERE release_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_creator_agent_status_idx" ON "tasks" USING btree ("creator_profile_id","agent_status") WHERE deleted_at IS NULL;