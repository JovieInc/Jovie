DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_outreach_route') THEN CREATE TYPE "public"."lead_outreach_route" AS ENUM('email', 'dm', 'both', 'manual_review', 'skipped'); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_outreach_status') THEN CREATE TYPE "public"."lead_outreach_status" AS ENUM('pending', 'queued', 'sent', 'failed', 'dm_sent', 'dismissed'); END IF; END $$;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_linktree_verified" boolean;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "spotify_popularity" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "spotify_followers" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "release_count" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "latest_release_date" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "priority_score" real;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_invalid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_suspicious" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_invalid_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "has_representation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "representation_signal" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "outreach_route" "lead_outreach_route";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "outreach_status" "lead_outreach_status";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "claim_token_hash" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "claim_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "instantly_lead_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "outreach_queued_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dm_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dm_copy" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_outreach_route_priority" ON "leads" USING btree ("outreach_route","priority_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_outreach_status" ON "leads" USING btree ("outreach_status");