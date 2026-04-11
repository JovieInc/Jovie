-- Wave 4b: Normalize audience JSONB arrays into relational tables
-- Add summary columns to audience_members for fast list views
ALTER TABLE "audience_members" ADD COLUMN IF NOT EXISTS "latest_referrer_url" text;--> statement-breakpoint
ALTER TABLE "audience_members" ADD COLUMN IF NOT EXISTS "latest_action_label" text;--> statement-breakpoint

-- Create normalized referrer history table
CREATE TABLE IF NOT EXISTS "audience_referrers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_member_id" uuid NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"timestamp" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create normalized action history table
CREATE TABLE IF NOT EXISTS "audience_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_member_id" uuid NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"platform" text,
	"timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "audience_referrers" ADD CONSTRAINT "audience_referrers_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "audience_referrers_member_ts_idx" ON "audience_referrers" USING btree ("audience_member_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_member_ts_idx" ON "audience_actions" USING btree ("audience_member_id","timestamp");
