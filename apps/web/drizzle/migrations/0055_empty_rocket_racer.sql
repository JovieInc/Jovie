DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'memory_entity_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."memory_entity_status" AS ENUM('candidate', 'confirmed', 'rejected', 'merged');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'memory_entity_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."memory_entity_type" AS ENUM('person', 'artist', 'song', 'location', 'studio', 'company', 'event', 'project', 'asset', 'file', 'release', 'recording');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'memory_observation_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."memory_observation_status" AS ENUM('proposed', 'accepted', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'memory_opportunity_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."memory_opportunity_status" AS ENUM('pending', 'approved', 'dismissed', 'completed', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'memory_source_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."memory_source_type" AS ENUM('chat_message', 'profile_photo', 'uploaded_asset', 'gmail_message', 'calendar_event', 'file', 'web', 'manual', 'dev_fixture');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "memory_asset_entity_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"mention_type" text,
	"confidence" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"source_record_id" uuid,
	"kind" text NOT NULL,
	"url" text,
	"storage_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_enrichment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_entity_id" uuid,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memory_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"type" "memory_entity_type" NOT NULL,
	"status" "memory_entity_status" DEFAULT 'candidate' NOT NULL,
	"primary_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entity_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"weight" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entity_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"confidence" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"source_record_id" uuid,
	"title" text,
	"occurred_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_record_id" uuid,
	"status" "memory_observation_status" DEFAULT 'proposed' NOT NULL,
	"fact" text NOT NULL,
	"confidence" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"entity_id" uuid,
	"status" "memory_opportunity_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"source_type" "memory_source_type" NOT NULL,
	"external_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_asset_entity_mentions" ADD CONSTRAINT "memory_asset_entity_mentions_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_asset_entity_mentions" ADD CONSTRAINT "memory_asset_entity_mentions_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_enrichment_jobs" ADD CONSTRAINT "memory_enrichment_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_enrichment_jobs" ADD CONSTRAINT "memory_enrichment_jobs_target_entity_id_memory_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_aliases" ADD CONSTRAINT "memory_entity_aliases_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_edges" ADD CONSTRAINT "memory_entity_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_edges" ADD CONSTRAINT "memory_entity_edges_from_entity_id_memory_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_edges" ADD CONSTRAINT "memory_entity_edges_to_entity_id_memory_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_identities" ADD CONSTRAINT "memory_entity_identities_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_event_participants" ADD CONSTRAINT "memory_event_participants_event_id_memory_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."memory_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_event_participants" ADD CONSTRAINT "memory_event_participants_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_observations" ADD CONSTRAINT "memory_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_observations" ADD CONSTRAINT "memory_observations_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_observations" ADD CONSTRAINT "memory_observations_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_opportunities" ADD CONSTRAINT "memory_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_opportunities" ADD CONSTRAINT "memory_opportunities_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_source_records" ADD CONSTRAINT "memory_source_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maem_asset_idx" ON "memory_asset_entity_mentions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maem_entity_idx" ON "memory_asset_entity_mentions" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ma_user_created_idx" ON "memory_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ma_source_idx" ON "memory_assets" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mej_user_status_idx" ON "memory_enrichment_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mej_target_idx" ON "memory_enrichment_jobs" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "me_user_type_status_idx" ON "memory_entities" USING btree ("user_id","type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "me_creator_idx" ON "memory_entities" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mea_entity_idx" ON "memory_entity_aliases" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mea_alias_idx" ON "memory_entity_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mee_user_from_idx" ON "memory_entity_edges" USING btree ("user_id","from_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mee_user_to_idx" ON "memory_entity_edges" USING btree ("user_id","to_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mee_rel_idx" ON "memory_entity_edges" USING btree ("relation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mei_entity_idx" ON "memory_entity_identities" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mei_prov_unique" ON "memory_entity_identities" USING btree ("entity_id","provider","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mep_event_idx" ON "memory_event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mep_entity_idx" ON "memory_event_participants" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mev_user_occurred_idx" ON "memory_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mo_user_entity_status_idx" ON "memory_observations" USING btree ("user_id","entity_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mo_source_idx" ON "memory_observations" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mop_user_status_idx" ON "memory_opportunities" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mop_entity_idx" ON "memory_opportunities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msr_user_created_idx" ON "memory_source_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msr_source_type_idx" ON "memory_source_records" USING btree ("source_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msr_ext_unique" ON "memory_source_records" USING btree ("user_id","source_type","external_id");