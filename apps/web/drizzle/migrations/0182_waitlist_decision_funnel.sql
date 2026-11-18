ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'disqualified' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'approved';--> statement-breakpoint
CREATE TABLE "capability_wants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"capability_key" text,
	"source" text NOT NULL,
	"source_turn_id" text,
	"question_variant" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "decision_rule_version" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "capability_wants" ADD CONSTRAINT "capability_wants_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capability_wants_entry_created_at" ON "capability_wants" USING btree ("waitlist_entry_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capability_wants_kind" ON "capability_wants" USING btree ("kind");
