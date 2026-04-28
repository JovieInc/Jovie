CREATE TABLE "chat_answer_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"message_id" uuid,
	"user_message_id" uuid,
	"conversation_id" uuid,
	"user_id" uuid NOT NULL,
	"retrieved_canon_paths" text[] NOT NULL,
	"retrieved_scores" numeric[] NOT NULL,
	"artist_tools_called" text[] NOT NULL,
	"retrieval_version" text NOT NULL,
	"git_sha" text,
	"model_id" text NOT NULL,
	"embedding_model" text,
	"retrieval_latency_ms" integer,
	"total_latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_answer_traces_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
ALTER TABLE "chat_answer_traces" ADD CONSTRAINT "chat_answer_traces_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_answer_traces" ADD CONSTRAINT "chat_answer_traces_user_message_id_chat_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_answer_traces" ADD CONSTRAINT "chat_answer_traces_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_answer_traces" ADD CONSTRAINT "chat_answer_traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"idx_chat_answer_traces_message_id" ON "chat_answer_traces" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"idx_chat_answer_traces_conversation_created" ON "chat_answer_traces" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"idx_chat_answer_traces_trace_id" ON "chat_answer_traces" USING btree ("trace_id");