-- JOV-5136: YouTube video library sync substrate.
-- NOTE: drizzle-kit generated this file from the 0085 snapshot, which predates
-- 0086-0088; the skill_rollout_assignments / skills_catalog.rollout /
-- discog_tracks_creator_slug_idx statements it re-emitted were removed here
-- because 0087 and 0088 already own them.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_match_source') THEN
		CREATE TYPE "public"."youtube_match_source" AS ENUM('distributor_data', 'first_party_release', 'manual');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_metric_window') THEN
		CREATE TYPE "public"."youtube_metric_window" AS ENUM('day_1', 'day_7', 'day_28', 'day_90', 'lifetime', 'experiment');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_release_link_status') THEN
		CREATE TYPE "public"."youtube_release_link_status" AS ENUM('pending_review', 'approved', 'rejected');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_thumbnail_approval') THEN
		CREATE TYPE "public"."youtube_thumbnail_approval" AS ENUM('not_required', 'pending', 'approved', 'rejected');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_thumbnail_kind') THEN
		CREATE TYPE "public"."youtube_thumbnail_kind" AS ENUM('original', 'previous', 'current', 'candidate');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'youtube_video_content_type') THEN
		CREATE TYPE "public"."youtube_video_content_type" AS ENUM('music_video', 'live_performance', 'lyric_video', 'short', 'vlog', 'other');
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_thumbnail_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" "youtube_thumbnail_kind" NOT NULL,
	"image_url" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"approval_status" "youtube_thumbnail_approval" DEFAULT 'not_required' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"swapped_at" timestamp,
	"rollback_target_id" uuid,
	"experiment_id" text,
	"cohort_id" text,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_video_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"window" "youtube_metric_window" NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"impressions" integer,
	"ctr" numeric(7, 6),
	"views" integer,
	"watch_time_minutes" numeric(12, 2),
	"watch_time_per_impression" numeric(12, 4),
	"avg_view_duration_seconds" numeric(10, 2),
	"traffic_sources" jsonb,
	"revenue_micros" bigint,
	"currency" text,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_video_release_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"release_id" uuid,
	"recording_id" uuid,
	"isrc" text,
	"match_source" "youtube_match_source" NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"status" "youtube_release_link_status" DEFAULT 'pending_review' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp,
	"duration_seconds" integer,
	"url" text NOT NULL,
	"privacy_status" text,
	"content_type" "youtube_video_content_type" DEFAULT 'other' NOT NULL,
	"classification_rationale" text,
	"classification_confidence" numeric(5, 4),
	"current_thumbnails" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_thumbnail_versions" ADD CONSTRAINT "youtube_thumbnail_versions_video_id_youtube_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_thumbnail_versions" ADD CONSTRAINT "youtube_thumbnail_versions_rollback_target_id_youtube_thumbnail_versions_id_fk" FOREIGN KEY ("rollback_target_id") REFERENCES "public"."youtube_thumbnail_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_video_metric_snapshots" ADD CONSTRAINT "youtube_video_metric_snapshots_video_id_youtube_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_video_release_links" ADD CONSTRAINT "youtube_video_release_links_video_id_youtube_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_video_release_links" ADD CONSTRAINT "youtube_video_release_links_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_video_release_links" ADD CONSTRAINT "youtube_video_release_links_recording_id_discog_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."discog_recordings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "youtube_thumbnail_versions_video_id_idx" ON "youtube_thumbnail_versions" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_video_metric_snapshots_video_window_range_unique" ON "youtube_video_metric_snapshots" USING btree ("video_id","window","window_start","window_end");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_video_release_links_video_unique" ON "youtube_video_release_links" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_videos_channel_video_unique" ON "youtube_videos" USING btree ("channel_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "youtube_videos_creator_profile_id_idx" ON "youtube_videos" USING btree ("creator_profile_id");
