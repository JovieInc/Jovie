DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_feedback_rating') THEN
    CREATE TYPE "public"."chat_feedback_rating" AS ENUM('up', 'down');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_feedback_reason') THEN
    CREATE TYPE "public"."chat_feedback_reason" AS ENUM('wrong', 'outdated', 'generic', 'hallucinated', 'bad_source', 'bad_tone', 'incomplete');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_answer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"message_id" uuid,
	"user_id" uuid NOT NULL,
	"rating" "chat_feedback_rating" NOT NULL,
	"reason" "chat_feedback_reason",
	"correction" text,
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_answer_feedback" ADD CONSTRAINT "chat_answer_feedback_trace_id_chat_answer_traces_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."chat_answer_traces"("trace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_answer_feedback" ADD CONSTRAINT "chat_answer_feedback_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_answer_feedback" ADD CONSTRAINT "chat_answer_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS"idx_chat_answer_feedback_trace_user_current" ON "chat_answer_feedback" USING btree ("trace_id","user_id") WHERE "chat_answer_feedback"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_answer_feedback_trace_id" ON "chat_answer_feedback" USING btree ("trace_id");