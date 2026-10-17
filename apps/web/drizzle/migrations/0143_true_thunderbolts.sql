CREATE TABLE "feedback_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_item_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "disposition" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "feedback_decisions" ADD CONSTRAINT "feedback_decisions_feedback_item_id_feedback_items_id_fk" FOREIGN KEY ("feedback_item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_decisions_item_created_idx" ON "feedback_decisions" USING btree ("feedback_item_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_decisions_decision_idx" ON "feedback_decisions" USING btree ("decision","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_disposition_idx" ON "feedback_items" USING btree ("disposition","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_fingerprint_idx" ON "feedback_items" USING btree ("fingerprint") WHERE "feedback_items"."fingerprint" IS NOT NULL;