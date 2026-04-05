DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type
		WHERE typname = 'metadata_submission_issue_status'
	) THEN
		CREATE TYPE "public"."metadata_submission_issue_status" AS ENUM('open', 'resolved', 'ignored');
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type
		WHERE typname = 'metadata_submission_status'
	) THEN
		CREATE TYPE "public"."metadata_submission_status" AS ENUM('draft', 'awaiting_approval', 'queued', 'sent', 'acknowledged', 'live', 'drifted', 'failed', 'manual_followup_needed', 'cancelled');
	END IF;
END
$$;--> statement-breakpoint
ALTER TYPE "public"."photo_status" ADD VALUE IF NOT EXISTS 'draft' BEFORE 'uploading';--> statement-breakpoint
CREATE TABLE "metadata_submission_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"text_body" text,
	"blob_url" text,
	"checksum" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_submission_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"field" text NOT NULL,
	"issue_type" text NOT NULL,
	"severity" text NOT NULL,
	"expected_value" text,
	"observed_value" text,
	"status" "metadata_submission_issue_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "metadata_submission_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid,
	"provider_id" text NOT NULL,
	"status" "metadata_submission_status" DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"latest_snapshot_at" timestamp,
	"provider_message_id" text,
	"reply_to_email" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_submission_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"target_id" uuid,
	"snapshot_type" text NOT NULL,
	"normalized_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hash" text NOT NULL,
	"observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_submission_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"canonical_url" text NOT NULL,
	"external_id" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "metadata_submission_artifacts" ADD CONSTRAINT "metadata_submission_artifacts_request_id_metadata_submission_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."metadata_submission_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_issues" ADD CONSTRAINT "metadata_submission_issues_request_id_metadata_submission_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."metadata_submission_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_requests" ADD CONSTRAINT "metadata_submission_requests_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_requests" ADD CONSTRAINT "metadata_submission_requests_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_snapshots" ADD CONSTRAINT "metadata_submission_snapshots_request_id_metadata_submission_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."metadata_submission_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_snapshots" ADD CONSTRAINT "metadata_submission_snapshots_target_id_metadata_submission_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."metadata_submission_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_submission_targets" ADD CONSTRAINT "metadata_submission_targets_request_id_metadata_submission_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."metadata_submission_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_artifacts_request_kind_idx" ON "metadata_submission_artifacts" USING btree ("request_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_issues_request_status_idx" ON "metadata_submission_issues" USING btree ("request_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_requests_creator_status_idx" ON "metadata_submission_requests" USING btree ("creator_profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_requests_release_idx" ON "metadata_submission_requests" USING btree ("release_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_snapshots_request_idx" ON "metadata_submission_snapshots" USING btree ("request_id","snapshot_type","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_snapshots_target_idx" ON "metadata_submission_snapshots" USING btree ("target_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_submission_targets_request_idx" ON "metadata_submission_targets" USING btree ("request_id","target_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metadata_submission_targets_request_url_unique" ON "metadata_submission_targets" USING btree ("request_id","canonical_url");
