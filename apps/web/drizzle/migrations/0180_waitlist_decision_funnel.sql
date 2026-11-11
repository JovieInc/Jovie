ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'disqualified' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'approved';--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "decision_reason" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "decision_rule_version" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "decided_by" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capability_wants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"capability_key" text,
	"source" text NOT NULL,
	"source_turn_id" text,
	"question_variant" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capability_wants" ADD CONSTRAINT "capability_wants_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capability_wants_entry_created_at" ON "capability_wants" ("waitlist_entry_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capability_wants_kind" ON "capability_wants" ("kind");
