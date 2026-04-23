CREATE TABLE IF NOT EXISTS "user_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary_attempts" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_interviews" ADD CONSTRAINT "user_interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_interviews_user_source_unique" ON "user_interviews" USING btree ("user_id","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_interviews_status_idx" ON "user_interviews" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "user_interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "user_interviews_select_own" ON "user_interviews";--> statement-breakpoint
DROP POLICY IF EXISTS "user_interviews_insert_own" ON "user_interviews";--> statement-breakpoint

CREATE POLICY "user_interviews_select_own"
  ON "user_interviews"
  FOR SELECT
  USING (
    "user_id" IN (
      SELECT "id" FROM "users" WHERE "clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "user_interviews_insert_own"
  ON "user_interviews"
  FOR INSERT
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users" WHERE "clerk_id" = current_clerk_user_id()
    )
  );
