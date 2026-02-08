DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_link_scan_phase') THEN
    CREATE TYPE "public"."release_link_scan_phase" AS ENUM('immediate', 'pre_release', 'release_window', 'post_release', 'completed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_link_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"scan_phase" "release_link_scan_phase" DEFAULT 'immediate' NOT NULL,
	"next_scan_at" timestamp,
	"last_scan_at" timestamp,
	"providers_found" integer DEFAULT 0 NOT NULL,
	"total_scans" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "announcement_date" timestamp;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "announce_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "release_day_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_link_scans_release_id_discog_releases_id_fk') THEN
    ALTER TABLE "release_link_scans" ADD CONSTRAINT "release_link_scans_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_link_scans_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "release_link_scans" ADD CONSTRAINT "release_link_scans_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_link_scans_release_unique" ON "release_link_scans" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_link_scans_next_scan_idx" ON "release_link_scans" USING btree ("next_scan_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_link_scans_phase_idx" ON "release_link_scans" USING btree ("scan_phase");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_releases_announcement_date_idx" ON "discog_releases" USING btree ("announcement_date");
