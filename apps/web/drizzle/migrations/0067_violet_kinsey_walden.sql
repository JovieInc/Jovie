-- JOV-3806: onboarding deterministic-script response bank + chat message attribution.
-- Note: drizzle-kit also re-emitted DDL from hand-authored 0065/0066 (they shipped
-- without meta snapshots); those statements are removed here because the objects
-- already exist. This migration's snapshot (meta/0067_snapshot.json) captures the
-- full current schema, repairing the snapshot lag for future generates.
CREATE TABLE IF NOT EXISTS "onboarding_script_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_key" text NOT NULL,
	"step_id" text NOT NULL,
	"variant" text NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "assistant_source" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "script_line_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_onboarding_script_lines_line_key" ON "onboarding_script_lines" USING btree ("line_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_onboarding_script_lines_step_status" ON "onboarding_script_lines" USING btree ("step_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_script_line_key" ON "chat_messages" USING btree ("script_line_key") WHERE "chat_messages"."script_line_key" IS NOT NULL;