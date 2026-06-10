CREATE TABLE "apple_wallet_pass_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_library_identifier" text NOT NULL,
	"push_token" text NOT NULL,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_wallet_pass_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pass_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"unregistered_at" timestamp,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_wallet_profile_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_link_id" uuid,
	"pass_type_identifier" text NOT NULL,
	"serial_number" text NOT NULL,
	"authentication_token_hash" text NOT NULL,
	"profile_url" text NOT NULL,
	"wallet_share_url" text NOT NULL,
	"display_name" text NOT NULL,
	"handle" text NOT NULL,
	"avatar_url" text,
	"avatar_asset_version" text NOT NULL,
	"pass_version" integer DEFAULT 1 NOT NULL,
	"last_updated_tag" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_downloaded_at" timestamp,
	"last_pushed_at" timestamp,
	"last_push_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_wallet_pass_registrations" ADD CONSTRAINT "apple_wallet_pass_registrations_pass_id_apple_wallet_profile_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."apple_wallet_profile_passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_wallet_pass_registrations" ADD CONSTRAINT "apple_wallet_pass_registrations_device_id_apple_wallet_pass_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."apple_wallet_pass_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_wallet_profile_passes" ADD CONSTRAINT "apple_wallet_profile_passes_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_wallet_profile_passes" ADD CONSTRAINT "apple_wallet_profile_passes_source_link_id_audience_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."audience_source_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apple_wallet_pass_devices_library_identifier_unique" ON "apple_wallet_pass_devices" USING btree ("device_library_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apple_wallet_pass_devices_active_idx" ON "apple_wallet_pass_devices" USING btree ("updated_at") WHERE disabled_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apple_wallet_pass_registrations_pass_device_unique" ON "apple_wallet_pass_registrations" USING btree ("pass_id","device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apple_wallet_pass_registrations_device_active_idx" ON "apple_wallet_pass_registrations" USING btree ("device_id","updated_at") WHERE unregistered_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apple_wallet_pass_registrations_pass_active_idx" ON "apple_wallet_pass_registrations" USING btree ("pass_id","updated_at") WHERE unregistered_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apple_wallet_profile_passes_profile_pass_type_unique" ON "apple_wallet_profile_passes" USING btree ("creator_profile_id","pass_type_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apple_wallet_profile_passes_pass_type_serial_unique" ON "apple_wallet_profile_passes" USING btree ("pass_type_identifier","serial_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apple_wallet_profile_passes_source_link_id_idx" ON "apple_wallet_profile_passes" USING btree ("source_link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apple_wallet_profile_passes_active_updated_idx" ON "apple_wallet_profile_passes" USING btree ("pass_type_identifier","updated_at") WHERE revoked_at IS NULL;
