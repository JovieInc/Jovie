CREATE TABLE "daily_profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"view_date" date NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_profile_views" ADD CONSTRAINT "daily_profile_views_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_profile_views_creator_profile_id_view_date_unique" ON "daily_profile_views" USING btree ("creator_profile_id","view_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_profile_views_creator_profile_id_view_date_idx" ON "daily_profile_views" USING btree ("creator_profile_id","view_date");
