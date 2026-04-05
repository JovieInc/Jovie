DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_mismatch_status') THEN
    CREATE TYPE "public"."catalog_mismatch_status" AS ENUM('flagged', 'confirmed_mismatch', 'dismissed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_mismatch_type') THEN
    CREATE TYPE "public"."catalog_mismatch_type" AS ENUM('not_in_catalog', 'missing_from_dsp');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_scan_status') THEN
    CREATE TYPE "public"."catalog_scan_status" AS ENUM('pending', 'running', 'completed', 'failed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dsp_catalog_mismatches" (
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
CREATE TABLE IF NOT EXISTS "dsp_catalog_scans" (
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
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dsp_catalog_mismatches_scan_id_dsp_catalog_scans_id_fk') THEN
    ALTER TABLE "dsp_catalog_mismatches" ADD CONSTRAINT "dsp_catalog_mismatches_scan_id_dsp_catalog_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."dsp_catalog_scans"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dsp_catalog_mismatches_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "dsp_catalog_mismatches" ADD CONSTRAINT "dsp_catalog_mismatches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dsp_catalog_scans_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "dsp_catalog_scans" ADD CONSTRAINT "dsp_catalog_scans_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dsp_catalog_mismatches_dedup_idx" ON "dsp_catalog_mismatches" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_creator_idx" ON "dsp_catalog_mismatches" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_scan_idx" ON "dsp_catalog_mismatches" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_mismatches_status_idx" ON "dsp_catalog_mismatches" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_scans_creator_idx" ON "dsp_catalog_scans" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_catalog_scans_status_idx" ON "dsp_catalog_scans" USING btree ("status","created_at");
