DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_lifecycle') THEN
    CREATE TYPE "public"."user_status_lifecycle" AS ENUM('waitlist_pending', 'waitlist_approved', 'profile_claimed', 'onboarding_incomplete', 'active', 'suspended', 'banned');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "status" SET DEFAULT 'new'::text;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."waitlist_status";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE "public"."waitlist_status" AS ENUM('new', 'invited', 'claimed');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."waitlist_status";--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "status" SET DATA TYPE "public"."waitlist_status" USING "status"::"public"."waitlist_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_users_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_users_waitlist_entry_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_users_waitlist_approval";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_status" "user_status_lifecycle";--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD COLUMN IF NOT EXISTS "bounce_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD COLUMN IF NOT EXISTS "last_bounce_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD COLUMN IF NOT EXISTS "bounce_reason" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "waitlist_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "fit_score" integer;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "fit_score_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "fit_score_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "genres" text[];--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "spotify_followers" integer;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "spotify_popularity" integer;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "ingestion_source_platform" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'creator_profiles_waitlist_entry_id_waitlist_entries_id_fk') THEN
    ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_user_status" ON "users" USING btree ("user_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingestion_jobs_dedup_key_unique" ON "ingestion_jobs" USING btree ("dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingestion_jobs_status_run_at" ON "ingestion_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_claim_invites_profile_email_unique" ON "creator_claim_invites" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_profiles_one_claimed_per_user" ON "creator_profiles" USING btree ("user_id") WHERE is_claimed = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_fit_score_unclaimed" ON "creator_profiles" USING btree ("fit_score","is_claimed","created_at") WHERE is_claimed = false AND fit_score IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_invites_claim_token_unique" ON "waitlist_invites" USING btree ("claim_token");