DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_lifecycle_stage') THEN
    CREATE TYPE "public"."contact_lifecycle_stage" AS ENUM('suggested', 'approved', 'outreach', 'profile_created', 'certified', 'signed_up', 'claimed', 'activated', 'paying', 'churned');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"from_stage" "contact_lifecycle_stage",
	"to_stage" "contact_lifecycle_stage" NOT NULL,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"source" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"display_name" text,
	"email_normalized" text,
	"primary_handle" text,
	"avatar_url" text,
	"stage" "contact_lifecycle_stage" DEFAULT 'suggested' NOT NULL,
	"stage_entered_at" timestamp,
	"stage_source" text,
	"certified_at" timestamp,
	"certified_by_user_id" uuid,
	"user_id" uuid,
	"creator_profile_id" uuid,
	"lead_id" uuid,
	"waitlist_entry_id" uuid,
	"provenance" jsonb,
	"first_seen_at" timestamp,
	"last_activity_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_stage_transitions_contact_id_contacts_id_fk') THEN
    ALTER TABLE "contact_stage_transitions" ADD CONSTRAINT "contact_stage_transitions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_certified_by_user_id_users_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_certified_by_user_id_users_id_fk" FOREIGN KEY ("certified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_user_id_users_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_creator_profile_id_creator_profiles_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_lead_id_leads_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_waitlist_entry_id_waitlist_entries_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_stage_transitions_contact_created_at" ON "contact_stage_transitions" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_stage_transitions_dedupe_key" ON "contact_stage_transitions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contacts_dedupe_key_unique" ON "contacts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_stage" ON "contacts" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_email_normalized" ON "contacts" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_user_id" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_creator_profile_id" ON "contacts" USING btree ("creator_profile_id");