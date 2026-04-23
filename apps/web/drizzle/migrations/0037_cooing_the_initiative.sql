DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reel_job_status') THEN
    CREATE TYPE "public"."reel_job_status" AS ENUM('queued', 'rendering', 'succeeded', 'failed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reel_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"template_slug" text DEFAULT 'teaser-v1' NOT NULL,
	"status" "reel_job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"output_url" text,
	"duration_ms" integer,
	"template_inputs" jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_jobs_status_created_at_idx" ON "reel_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_jobs_release_id_idx" ON "reel_jobs" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_jobs_creator_profile_id_idx" ON "reel_jobs" USING btree ("creator_profile_id");
