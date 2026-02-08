DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_bio_sync_method') THEN
    CREATE TYPE "public"."dsp_bio_sync_method" AS ENUM('api', 'email');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_bio_sync_status') THEN
    CREATE TYPE "public"."dsp_bio_sync_status" AS ENUM('pending', 'sending', 'sent', 'delivered', 'failed', 'unsupported');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dsp_bio_sync_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"method" "dsp_bio_sync_method" NOT NULL,
	"status" "dsp_bio_sync_status" DEFAULT 'pending' NOT NULL,
	"bio_text" text NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dsp_bio_sync_requests_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "dsp_bio_sync_requests" ADD CONSTRAINT "dsp_bio_sync_requests_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_bio_sync_requests_creator_provider_idx" ON "dsp_bio_sync_requests" USING btree ("creator_profile_id","provider_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_bio_sync_requests_status_idx" ON "dsp_bio_sync_requests" USING btree ("status","created_at") WHERE status IN ('pending', 'sending');
