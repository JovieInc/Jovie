CREATE TABLE "admin_system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"playlist_spotify_clerk_user_id" text,
	"playlist_spotify_updated_at" timestamp,
	"playlist_spotify_updated_by" uuid,
	"playlist_engine_enabled" boolean DEFAULT false NOT NULL,
	"playlist_generation_interval_value" integer DEFAULT 3 NOT NULL,
	"playlist_generation_interval_unit" text DEFAULT 'days' NOT NULL,
	"playlist_last_generated_at" timestamp,
	"playlist_next_eligible_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD CONSTRAINT "admin_system_settings_playlist_spotify_updated_by_users_id_fk" FOREIGN KEY ("playlist_spotify_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD CONSTRAINT "admin_system_settings_singleton_id_check" CHECK ("id" = 1);
--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD CONSTRAINT "admin_system_settings_playlist_interval_value_check" CHECK ("playlist_generation_interval_value" >= 1);
--> statement-breakpoint
ALTER TABLE "admin_system_settings" ADD CONSTRAINT "admin_system_settings_playlist_interval_unit_check" CHECK ("playlist_generation_interval_unit" IN ('hours', 'days', 'weeks'));
--> statement-breakpoint
INSERT INTO "admin_system_settings" ("id", "playlist_engine_enabled", "playlist_generation_interval_value", "playlist_generation_interval_unit")
VALUES (1, false, 3, 'days')
ON CONFLICT ("id") DO NOTHING;
