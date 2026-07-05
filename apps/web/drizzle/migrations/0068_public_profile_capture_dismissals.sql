CREATE TABLE IF NOT EXISTS "public_profile_capture_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"audience_id" text NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"source" text,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	"next_eligible_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'public_profile_capture_dismissals_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "public_profile_capture_dismissals"
      ADD CONSTRAINT "public_profile_capture_dismissals_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_profile_capture_dismissals_profile_audience_unique" ON "public_profile_capture_dismissals" USING btree ("creator_profile_id","audience_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_profile_capture_dismissals_profile_next_eligible_idx" ON "public_profile_capture_dismissals" USING btree ("creator_profile_id","next_eligible_at");
