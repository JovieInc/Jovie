CREATE TABLE IF NOT EXISTS "track_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"track_id" uuid,
	"source" text NOT NULL,
	"snapshot_day" date NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "track_daily_snapshots_source_check" CHECK ("track_daily_snapshots"."source" in ('spotify_popularity', 'youtube_views', 'jovie_release'))
);
--> statement-breakpoint
ALTER TABLE "track_daily_snapshots" ADD CONSTRAINT "track_daily_snapshots_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_daily_snapshots" ADD CONSTRAINT "track_daily_snapshots_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_daily_snapshots" ADD CONSTRAINT "track_daily_snapshots_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_daily_snapshots_track_source_day" ON "track_daily_snapshots" USING btree ("track_id","source","snapshot_day") WHERE track_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_daily_snapshots_release_source_day" ON "track_daily_snapshots" USING btree ("release_id","source","snapshot_day") WHERE track_id IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_daily_snapshots_profile_day_idx" ON "track_daily_snapshots" USING btree ("creator_profile_id","snapshot_day");