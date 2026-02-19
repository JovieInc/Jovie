CREATE TABLE IF NOT EXISTS "ingest_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"user_id" uuid,
	"artist_id" uuid,
	"spotify_id" text,
	"handle" text,
	"action" text,
	"result" text,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_type" ON "ingest_audit_logs" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_user_id" ON "ingest_audit_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_created_at" ON "ingest_audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_result" ON "ingest_audit_logs" USING btree ("result");
