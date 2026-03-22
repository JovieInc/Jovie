-- Repair follow-up: some production databases are missing ownership/claim tables
-- and notification_subscriptions.name despite migrations being recorded as applied.
-- Keep this idempotent so it is safe across environments.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_claim_role') THEN
    CREATE TYPE "public"."profile_claim_role" AS ENUM ('owner', 'manager', 'viewer');
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'profile_ownership_action'
  ) THEN
    CREATE TYPE "public"."profile_ownership_action" AS ENUM (
      'claimed',
      'linked',
      'unlinked',
      'transferred',
      'role_changed'
    );
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profile_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "creator_profile_id" uuid,
  "role" "profile_claim_role" DEFAULT 'owner' NOT NULL,
  "claimed_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "creator_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "role" "profile_claim_role" DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_ownership_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_profile_id" uuid,
  "user_id" uuid,
  "action" "profile_ownership_action",
  "performed_by" uuid,
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "creator_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "action" "profile_ownership_action";
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "performed_by" uuid;
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "reason" text;
--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
