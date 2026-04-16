CREATE TABLE IF NOT EXISTS "audience_source_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" text DEFAULT 'qr' NOT NULL,
	"destination_kind" text DEFAULT 'profile' NOT NULL,
	"destination_id" text,
	"destination_url" text,
	"utm_params" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audience_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_group_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text DEFAULT 'qr' NOT NULL,
	"destination_kind" text DEFAULT 'profile' NOT NULL,
	"destination_id" text,
	"destination_url" text NOT NULL,
	"utm_params" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"last_scanned_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "creator_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "event_type" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "verb" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "confidence" text DEFAULT 'observed' NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "source_kind" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "source_label" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "source_link_id" uuid;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "object_type" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "object_id" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "object_label" text;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "click_event_id" uuid;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "properties" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD COLUMN IF NOT EXISTS "context" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_source_groups" ADD CONSTRAINT "audience_source_groups_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_source_links" ADD CONSTRAINT "audience_source_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_source_links" ADD CONSTRAINT "audience_source_links_source_group_id_audience_source_groups_id_fk" FOREIGN KEY ("source_group_id") REFERENCES "public"."audience_source_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_source_link_id_audience_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."audience_source_links"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_click_event_id_click_events_id_fk" FOREIGN KEY ("click_event_id") REFERENCES "public"."click_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_creator_profile_id_timestamp_idx" ON "audience_actions" USING btree ("creator_profile_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_source_link_id_timestamp_idx" ON "audience_actions" USING btree ("source_link_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_event_type_timestamp_idx" ON "audience_actions" USING btree ("event_type","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_groups_creator_profile_id_created_at_idx" ON "audience_source_groups" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_groups_creator_profile_id_source_type_idx" ON "audience_source_groups" USING btree ("creator_profile_id","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_source_links_code_unique" ON "audience_source_links" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_source_group_id_idx" ON "audience_source_links" USING btree ("creator_profile_id","source_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_source_type_idx" ON "audience_source_links" USING btree ("creator_profile_id","source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_last_scanned_at_idx" ON "audience_source_links" USING btree ("creator_profile_id","last_scanned_at");
