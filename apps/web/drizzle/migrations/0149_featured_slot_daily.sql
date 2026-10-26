CREATE TABLE IF NOT EXISTS "featured_slot_daily" (
	"day" date NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"channel" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"taps" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "featured_slot_daily_day_creator_profile_id_kind_reason_channel_pk" PRIMARY KEY("day","creator_profile_id","kind","reason","channel"),
	CONSTRAINT "featured_slot_daily_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "featured_slot_daily_day_idx" ON "featured_slot_daily" USING btree ("day");
