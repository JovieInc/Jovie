CREATE TABLE "feature_flag_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" text NOT NULL,
	"env_tier" text NOT NULL,
	"action" text NOT NULL,
	"actor" text,
	"previous_value" boolean,
	"new_value" boolean,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feature_flag_audit_events_flag_key" ON "feature_flag_audit_events" USING btree ("flag_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feature_flag_audit_events_env_tier" ON "feature_flag_audit_events" USING btree ("env_tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feature_flag_audit_events_created_at" ON "feature_flag_audit_events" USING btree ("created_at");