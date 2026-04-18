CREATE TABLE "audience_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid,
	"audience_member_id" uuid NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"platform" text,
	"event_type" text DEFAULT 'legacy' NOT NULL,
	"verb" text,
	"confidence" text DEFAULT 'observed' NOT NULL,
	"source_kind" text,
	"source_label" text,
	"source_link_id" uuid,
	"object_type" text,
	"object_id" text,
	"object_label" text,
	"click_event_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"context" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_source_groups" (
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
CREATE TABLE "audience_source_links" (
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
CREATE TABLE "canvas_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" integer,
	"file_size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_track_id" uuid,
	"legacy_track_id" uuid,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"image_master_id" uuid,
	"status" text NOT NULL,
	"stage" text NOT NULL,
	"motion_preset" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"loop_strategy" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"qc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "canvas_generations_track_ref_check" CHECK (num_nonnulls(release_track_id, legacy_track_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "canvas_image_masters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_artwork_url" text NOT NULL,
	"source_artwork_fingerprint" text NOT NULL,
	"release_id" uuid NOT NULL,
	"processed_image_path" text NOT NULL,
	"preview_image_path" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"manifest_path" text NOT NULL,
	"qc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_canvas_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_track_id" uuid,
	"legacy_track_id" uuid,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"current_generation_id" uuid,
	"uploaded_generation_id" uuid,
	"status" text NOT NULL,
	"last_error" text,
	"last_generated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "track_canvas_state_track_ref_check" CHECK (num_nonnulls(release_track_id, legacy_track_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_source_link_id_audience_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."audience_source_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_click_event_id_click_events_id_fk" FOREIGN KEY ("click_event_id") REFERENCES "public"."click_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_source_groups" ADD CONSTRAINT "audience_source_groups_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_source_links" ADD CONSTRAINT "audience_source_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_source_links" ADD CONSTRAINT "audience_source_links_source_group_id_audience_source_groups_id_fk" FOREIGN KEY ("source_group_id") REFERENCES "public"."audience_source_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_artifacts" ADD CONSTRAINT "canvas_artifacts_generation_id_canvas_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."canvas_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_generations" ADD CONSTRAINT "canvas_generations_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_generations" ADD CONSTRAINT "canvas_generations_legacy_track_id_discog_tracks_id_fk" FOREIGN KEY ("legacy_track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_generations" ADD CONSTRAINT "canvas_generations_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_generations" ADD CONSTRAINT "canvas_generations_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_generations" ADD CONSTRAINT "canvas_generations_image_master_id_canvas_image_masters_id_fk" FOREIGN KEY ("image_master_id") REFERENCES "public"."canvas_image_masters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_image_masters" ADD CONSTRAINT "canvas_image_masters_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_image_masters" ADD CONSTRAINT "canvas_image_masters_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_canvas_state" ADD CONSTRAINT "track_canvas_state_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_canvas_state" ADD CONSTRAINT "track_canvas_state_legacy_track_id_discog_tracks_id_fk" FOREIGN KEY ("legacy_track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_canvas_state" ADD CONSTRAINT "track_canvas_state_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_canvas_state" ADD CONSTRAINT "track_canvas_state_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_creator_profile_id_timestamp_idx" ON "audience_actions" USING btree ("creator_profile_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_member_ts_idx" ON "audience_actions" USING btree ("audience_member_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_source_link_id_timestamp_idx" ON "audience_actions" USING btree ("source_link_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_actions_event_type_timestamp_idx" ON "audience_actions" USING btree ("event_type","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_groups_creator_profile_id_created_at_idx" ON "audience_source_groups" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_groups_creator_profile_id_source_type_idx" ON "audience_source_groups" USING btree ("creator_profile_id","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_source_links_code_unique" ON "audience_source_links" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_source_group_id_idx" ON "audience_source_links" USING btree ("creator_profile_id","source_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_source_type_idx" ON "audience_source_links" USING btree ("creator_profile_id","source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_source_links_creator_profile_id_last_scanned_at_idx" ON "audience_source_links" USING btree ("creator_profile_id","last_scanned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_artifacts_generation_kind_idx" ON "canvas_artifacts" USING btree ("generation_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_generations_release_track_created_idx" ON "canvas_generations" USING btree ("release_track_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_generations_legacy_track_created_idx" ON "canvas_generations" USING btree ("legacy_track_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_generations_creator_status_idx" ON "canvas_generations" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canvas_image_masters_creator_fingerprint_unique" ON "canvas_image_masters" USING btree ("creator_profile_id","source_artwork_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_image_masters_release_id_idx" ON "canvas_image_masters" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_canvas_state_release_track_unique" ON "track_canvas_state" USING btree ("release_track_id") WHERE release_track_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_canvas_state_legacy_track_unique" ON "track_canvas_state" USING btree ("legacy_track_id") WHERE legacy_track_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_canvas_state_release_id_idx" ON "track_canvas_state" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_canvas_state_creator_status_idx" ON "track_canvas_state" USING btree ("creator_profile_id","status");
