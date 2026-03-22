-- Repair migration-journal drift where some baseline DDL was marked applied
-- but never executed on long-lived environments.
ALTER TABLE "notification_subscriptions" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "profile_ownership_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "profile_ownership_action" NOT NULL,
	"performed_by" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_profile_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"role" "profile_claim_role" DEFAULT 'owner' NOT NULL,
	"claimed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'profile_ownership_log_creator_profile_id_creator_profiles_id_fk'
	) THEN
		ALTER TABLE "profile_ownership_log"
			ADD CONSTRAINT "profile_ownership_log_creator_profile_id_creator_profiles_id_fk"
			FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'profile_ownership_log_user_id_users_id_fk'
	) THEN
		ALTER TABLE "profile_ownership_log"
			ADD CONSTRAINT "profile_ownership_log_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'profile_ownership_log_performed_by_users_id_fk'
	) THEN
		ALTER TABLE "profile_ownership_log"
			ADD CONSTRAINT "profile_ownership_log_performed_by_users_id_fk"
			FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id")
			ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'user_profile_claims_user_id_users_id_fk'
	) THEN
		ALTER TABLE "user_profile_claims"
			ADD CONSTRAINT "user_profile_claims_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'user_profile_claims_creator_profile_id_creator_profiles_id_fk'
	) THEN
		ALTER TABLE "user_profile_claims"
			ADD CONSTRAINT "user_profile_claims_creator_profile_id_creator_profiles_id_fk"
			FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_profile_ownership_log_profile"
	ON "profile_ownership_log" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_claims_unique_profile"
	ON "user_profile_claims" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_profile_claims_user_id"
	ON "user_profile_claims" USING btree ("user_id");
