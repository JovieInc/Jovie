CREATE TABLE "improvement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"analysis_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"linear_issue_id" text
);
--> statement-breakpoint
ALTER TABLE "improvement_items" ADD CONSTRAINT "improvement_items_session_id_chat_conversations_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_improvement_items_status_created_at" ON "improvement_items" USING btree ("status","created_at");
