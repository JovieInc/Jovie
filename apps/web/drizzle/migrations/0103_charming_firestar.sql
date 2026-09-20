CREATE TABLE IF NOT EXISTS "server_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_version" text NOT NULL,
	"event_name" text NOT NULL,
	"category" text NOT NULL,
	"privacy_class" text NOT NULL,
	"consent_policy" text NOT NULL,
	"source_entity_type" text,
	"source_entity_id" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_analytics_events_event_occurred_at_idx" ON "server_analytics_events" USING btree ("event_name","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_analytics_events_source_occurred_at_idx" ON "server_analytics_events" USING btree ("source_entity_type","source_entity_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_analytics_events_created_at_idx" ON "server_analytics_events" USING btree ("created_at");
