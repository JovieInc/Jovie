-- Versioned content records (content as data). Three new tables, no changes to
-- existing ones: append-only versions, one live pointer per record, and an
-- append-only audit log of publishes and rollbacks.
CREATE TABLE IF NOT EXISTS "content_record_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"record_key" text NOT NULL,
	"action" text NOT NULL,
	"from_version_id" uuid,
	"to_version_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_record_live" (
	"kind" text NOT NULL,
	"record_key" text NOT NULL,
	"version_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"record_key" text NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"author" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "content_record_live" ADD CONSTRAINT "content_record_live_version_id_content_record_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."content_record_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_record_events_kind_key_created_idx" ON "content_record_events" USING btree ("kind","record_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_record_live_kind_key_uq" ON "content_record_live" USING btree ("kind","record_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_record_versions_kind_key_version_uq" ON "content_record_versions" USING btree ("kind","record_key","version");
