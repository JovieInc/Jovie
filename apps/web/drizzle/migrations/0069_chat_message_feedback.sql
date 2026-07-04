-- JOV #11460: in-chat 👍/👎 feedback capture on every assistant message and
-- tool/skill result. Extends the existing feedback_items store (no parallel
-- table) and records the producing model on chat_turns for vote attribution.
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "model" text;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "message_id" text;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "turn_id" uuid;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "tool_call_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "tool_name" text;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "model_used" text;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "plan" text;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "vote" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_items_conversation_id_chat_conversations_id_fk'
  ) THEN
    ALTER TABLE "feedback_items"
      ADD CONSTRAINT "feedback_items_conversation_id_chat_conversations_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_items_turn_id_chat_turns_id_fk'
  ) THEN
    ALTER TABLE "feedback_items"
      ADD CONSTRAINT "feedback_items_turn_id_chat_turns_id_fk"
      FOREIGN KEY ("turn_id") REFERENCES "public"."chat_turns"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_items_vote_unique"
  ON "feedback_items" ("user_id", "message_id", "tool_call_id")
  WHERE "message_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_vote_model_idx"
  ON "feedback_items" ("model_used", "vote")
  WHERE "vote" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_conversation_idx"
  ON "feedback_items" ("conversation_id")
  WHERE "conversation_id" IS NOT NULL;
