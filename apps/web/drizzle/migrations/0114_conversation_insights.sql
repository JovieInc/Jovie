DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_funnel_stage') THEN
    CREATE TYPE "public"."conversation_funnel_stage" AS ENUM('anonymous', 'claimed', 'paid');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'objection_status') THEN
    CREATE TYPE "public"."objection_status" AS ENUM('draft', 'approved', 'published', 'rejected');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_objections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objection_key" text NOT NULL,
	"objection" text NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"stage" "conversation_funnel_stage" NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"drafted_answer" text,
	"status" "objection_status" DEFAULT 'draft' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolution_ref" text,
	"resolved_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"stage" "conversation_funnel_stage" NOT NULL,
	"intent" text NOT NULL,
	"objection_key" text,
	"confusion_or_bug" boolean DEFAULT false NOT NULL,
	"feature_ask" text,
	"drop_off_point" text,
	"redacted_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_signals_conversation_id_chat_conversations_id_fk') THEN
    ALTER TABLE "conversation_signals" ADD CONSTRAINT "conversation_signals_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversation_objections_key_unique" ON "conversation_objections" USING btree ("objection_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_objections_status" ON "conversation_objections" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_objections_stage" ON "conversation_objections" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversation_signals_conversation_unique" ON "conversation_signals" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_signals_week_stage" ON "conversation_signals" USING btree ("week_start","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_signals_objection" ON "conversation_signals" USING btree ("objection_key");
