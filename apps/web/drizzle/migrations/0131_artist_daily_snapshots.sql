CREATE TABLE "artist_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source" text NOT NULL,
	"snapshot_day" date NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw_values" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	CONSTRAINT "artist_daily_snapshots_source_check" CHECK ("artist_daily_snapshots"."source" in ('youtube', 'instagram', 'wikipedia'))
);
--> statement-breakpoint
ALTER TABLE "artist_daily_snapshots" ADD CONSTRAINT "artist_daily_snapshots_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artist_daily_snapshots_artist_source_day_unique" ON "artist_daily_snapshots" USING btree ("creator_profile_id","source","snapshot_day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_daily_snapshots_day_source_idx" ON "artist_daily_snapshots" USING btree ("snapshot_day","source");