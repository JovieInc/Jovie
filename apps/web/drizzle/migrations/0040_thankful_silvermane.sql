DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reel_pack_status') THEN
    CREATE TYPE "public"."reel_pack_status" AS ENUM('pending', 'partial', 'complete', 'failed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reel_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"status" "reel_pack_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reel_packs" ADD CONSTRAINT "reel_packs_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reel_packs" ADD CONSTRAINT "reel_packs_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_packs_release_created_at_idx" ON "reel_packs" USING btree ("release_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_packs_creator_profile_id_idx" ON "reel_packs" USING btree ("creator_profile_id");--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "pack_id" uuid;--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "format" text DEFAULT 'teaser-v1' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_pack_id_reel_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."reel_packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reel_jobs_pack_id_idx" ON "reel_jobs" USING btree ("pack_id");
