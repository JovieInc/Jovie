DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_turn_status') THEN
  CREATE TYPE "chat_turn_status" AS ENUM('reserved', 'running', 'streaming', 'completed', 'failed_tool_unavailable', 'failed_model_error', 'failed_timeout', 'failed_network', 'canceled');
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_turn_id" text NOT NULL,
	"status" "chat_turn_status" DEFAULT 'reserved' NOT NULL,
	"source" text DEFAULT 'typed' NOT NULL,
	"tool_intent" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "turn_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "client_message_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_turns_conversation_client_turn_unique" ON "chat_turns" USING btree ("conversation_id","client_turn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_turns_conversation_id" ON "chat_turns" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_turns_status" ON "chat_turns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_turns_updated_at" ON "chat_turns" USING btree ("updated_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_turn_id_chat_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_turn_id" ON "chat_messages" USING btree ("turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_messages_conversation_client_message_unique" ON "chat_messages" USING btree ("conversation_id","client_message_id") WHERE "chat_messages"."client_message_id" IS NOT NULL;
