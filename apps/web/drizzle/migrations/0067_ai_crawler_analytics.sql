CREATE TABLE IF NOT EXISTS "ai_crawler_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"period_days" integer DEFAULT 30 NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"weekly_requests" integer DEFAULT 0 NOT NULL,
	"crawlers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_trend" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_crawler_analytics_snapshots_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "ai_crawler_analytics_snapshots"
      ADD CONSTRAINT "ai_crawler_analytics_snapshots_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_crawler_analytics_profile_period_unique" ON "ai_crawler_analytics_snapshots" USING btree ("creator_profile_id","period_days");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_crawler_analytics_synced_at_idx" ON "ai_crawler_analytics_snapshots" USING btree ("synced_at");