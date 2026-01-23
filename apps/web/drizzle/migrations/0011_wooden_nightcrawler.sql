CREATE TABLE "click_event_daily_link_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"day" date NOT NULL,
	"link_type" "link_type" NOT NULL,
	"link_id" uuid NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "click_event_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"day" date NOT NULL,
	"link_type" "link_type" NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "click_event_daily_link_rollups" ADD CONSTRAINT "click_event_daily_link_rollups_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_event_daily_rollups" ADD CONSTRAINT "click_event_daily_rollups_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_event_daily_link_rollups_creator_day_idx" ON "click_event_daily_link_rollups" USING btree ("creator_profile_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_event_daily_link_rollups_creator_day_link_idx" ON "click_event_daily_link_rollups" USING btree ("creator_profile_id","day","link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_event_daily_rollups_creator_day_idx" ON "click_event_daily_rollups" USING btree ("creator_profile_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_event_daily_rollups_creator_day_link_type_idx" ON "click_event_daily_rollups" USING btree ("creator_profile_id","day","link_type");