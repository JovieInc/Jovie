CREATE TABLE IF NOT EXISTS "signup_replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentry_replay_id" text NOT NULL,
	"onboarding_session_id" text,
	"user_id" uuid,
	"flush_trigger" text,
	"flushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_replays_sentry_replay_id_unique" UNIQUE("sentry_replay_id")
);
--> statement-breakpoint
ALTER TABLE "signup_replays" ADD CONSTRAINT "signup_replays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_replays_user_id_idx" ON "signup_replays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_replays_flushed_at_idx" ON "signup_replays" USING btree ("flushed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_replays_onboarding_session_id_idx" ON "signup_replays" USING btree ("onboarding_session_id");