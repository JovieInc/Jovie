CREATE TABLE "smart_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"query" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"artist_name" text,
	"artwork_url" text,
	"providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isrc" text,
	"upc" text,
	"provider_key" text,
	"created_by_user_id" uuid,
	"anonymous_subject_hash" text,
	"anonymous_month" timestamp with time zone,
	"anonymous_slot" integer,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_links_anonymous_quota_shape" CHECK (("smart_links"."anonymous_subject_hash" IS NULL AND "smart_links"."anonymous_month" IS NULL AND "smart_links"."anonymous_slot" IS NULL) OR ("smart_links"."anonymous_subject_hash" IS NOT NULL AND "smart_links"."anonymous_month" IS NOT NULL AND "smart_links"."anonymous_slot" BETWEEN 0 AND 2))
);
--> statement-breakpoint
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_links_anonymous_month_idx" ON "smart_links" USING btree ("anonymous_subject_hash","anonymous_month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_anonymous_month_slot_unique" ON "smart_links" USING btree ("anonymous_subject_hash","anonymous_month","anonymous_slot") WHERE "smart_links"."anonymous_subject_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_code_unique" ON "smart_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_isrc_unique" ON "smart_links" USING btree ("isrc") WHERE "smart_links"."isrc" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_provider_key_unique" ON "smart_links" USING btree ("provider_key") WHERE "smart_links"."provider_key" IS NOT NULL;
