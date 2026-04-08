DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'creator_distribution_event_type'
	) THEN
		CREATE TYPE "public"."creator_distribution_event_type" AS ENUM('step_viewed', 'link_copied', 'platform_opened', 'skipped', 'activated');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type WHERE typname = 'creator_distribution_platform'
	) THEN
		CREATE TYPE "public"."creator_distribution_platform" AS ENUM('instagram');
	END IF;
END $$;--> statement-breakpoint
CREATE TABLE "creator_distribution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" "creator_distribution_platform" NOT NULL,
	"event_type" "creator_distribution_event_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_distribution_events" ADD CONSTRAINT "creator_distribution_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_distribution_events_profile_platform_created" ON "creator_distribution_events" USING btree ("creator_profile_id","platform","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_distribution_events_profile_event_created" ON "creator_distribution_events" USING btree ("creator_profile_id","event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_distribution_events_dedupe_key_unique" ON "creator_distribution_events" USING btree ("dedupe_key") WHERE dedupe_key IS NOT NULL;
