CREATE TABLE "profile_surfaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"platform" text NOT NULL,
	"display_name" text,
	"handle" text,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"external_id" text,
	"qualification_status" text DEFAULT 'suggested' NOT NULL,
	"identity_confidence" numeric(3, 2),
	"is_official" boolean DEFAULT false NOT NULL,
	"availability" text DEFAULT 'eligible' NOT NULL,
	"monitoring_priority" integer DEFAULT 0 NOT NULL,
	"last_discovered_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"last_observed_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"replaced_by_surface_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_surface_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surface_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_ref_id" text NOT NULL,
	"source_url" text,
	"external_id" text,
	"reconciliation_generation" integer DEFAULT 1 NOT NULL,
	"is_live" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_surface_qualification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surface_id" uuid NOT NULL,
	"previous_status" text,
	"next_status" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_surface_monitoring_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"surface_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"user_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_surfaces" ADD CONSTRAINT "profile_surfaces_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surfaces" ADD CONSTRAINT "profile_surfaces_replaced_by_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("replaced_by_surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surface_sources" ADD CONSTRAINT "profile_surface_sources_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surface_qualification_events" ADD CONSTRAINT "profile_surface_qualification_events_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surface_monitoring_preferences" ADD CONSTRAINT "profile_surface_monitoring_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surface_monitoring_preferences" ADD CONSTRAINT "profile_surface_monitoring_preferences_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_surface_monitoring_preferences" ADD CONSTRAINT "profile_surface_monitoring_preferences_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_surfaces_live_url_uniq" ON "profile_surfaces" USING btree ("creator_profile_id","normalized_url") WHERE retired_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surfaces_profile_kind_idx" ON "profile_surfaces" USING btree ("creator_profile_id","kind","monitoring_priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surfaces_profile_availability_idx" ON "profile_surfaces" USING btree ("creator_profile_id","availability","retired_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_surface_sources_identity_uniq" ON "profile_surface_sources" USING btree ("source_type","source_ref_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surface_sources_surface_live_idx" ON "profile_surface_sources" USING btree ("surface_id","is_live","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surface_qualification_events_surface_idx" ON "profile_surface_qualification_events" USING btree ("surface_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_surface_monitoring_preferences_user_surface_uniq" ON "profile_surface_monitoring_preferences" USING btree ("user_id","surface_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surface_monitoring_preferences_account_idx" ON "profile_surface_monitoring_preferences" USING btree ("user_id","creator_profile_id","state");
