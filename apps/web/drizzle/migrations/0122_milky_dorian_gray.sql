DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_approval_event') THEN
		CREATE TYPE "public"."profile_approval_event" AS ENUM('requested', 'approved', 'rejected', 'expired', 'revoked', 'consumed');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_approval_status') THEN
		CREATE TYPE "public"."profile_approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'revoked');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_risky_action') THEN
		CREATE TYPE "public"."profile_risky_action" AS ENUM('links.mutate', 'handle.change', 'auth.change', 'membership.manage', 'broadcast.send');
	END IF;
END $$;--> statement-breakpoint
ALTER TYPE "public"."profile_claim_role" ADD VALUE IF NOT EXISTS 'assistant' BEFORE 'viewer';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_action_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"action" "profile_risky_action" NOT NULL,
	"status" "profile_approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"payload" jsonb,
	"reason" text,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"event" "profile_approval_event" NOT NULL,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_action_approvals" ADD CONSTRAINT "profile_action_approvals_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_action_approvals" ADD CONSTRAINT "profile_action_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_action_approvals" ADD CONSTRAINT "profile_action_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_approval_events" ADD CONSTRAINT "profile_approval_events_approval_id_profile_action_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."profile_action_approvals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_approval_events" ADD CONSTRAINT "profile_approval_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_approval_events" ADD CONSTRAINT "profile_approval_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_action_approvals_profile" ON "profile_action_approvals" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_action_approvals_status" ON "profile_action_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_action_approvals_requester" ON "profile_action_approvals" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_approval_events_approval" ON "profile_approval_events" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_approval_events_profile" ON "profile_approval_events" USING btree ("creator_profile_id");
