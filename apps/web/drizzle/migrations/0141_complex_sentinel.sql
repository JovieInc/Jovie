CREATE TABLE IF NOT EXISTS "audience_projection_snapshots" (
	"audience_member_id" uuid PRIMARY KEY NOT NULL,
	"original" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audience_referrers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_member_id" uuid NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"legacy_key" text,
	"legacy_payload" jsonb,
	"timestamp" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "legacy_key" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "legacy_payload" jsonb;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "audience_projection_snapshots" ADD CONSTRAINT "audience_projection_snapshots_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "audience_referrers" ADD CONSTRAINT "audience_referrers_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
--> statement-breakpoint
-- 0030 created this table before it was registered in the schema barrel.
ALTER TABLE "audience_referrers" ADD COLUMN IF NOT EXISTS "legacy_key" text;--> statement-breakpoint
ALTER TABLE "audience_referrers" ADD COLUMN IF NOT EXISTS "legacy_payload" jsonb;--> statement-breakpoint
-- Historical NULLs are retained; no existing timestamp is converted or rewritten.
ALTER TABLE "audience_referrers" ALTER COLUMN "timestamp" DROP NOT NULL;

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_referrers_member_legacy_key_unique" ON "audience_referrers" USING btree ("audience_member_id","legacy_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_referrers_member_ts_idx" ON "audience_referrers" USING btree ("audience_member_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_actions_member_legacy_key_unique" ON "audience_actions" USING btree ("audience_member_id","legacy_key");
