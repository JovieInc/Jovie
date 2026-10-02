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
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_code_unique" ON "smart_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_isrc_unique" ON "smart_links" USING btree ("isrc") WHERE isrc IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_links_provider_key_unique" ON "smart_links" USING btree ("provider_key") WHERE provider_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_links_anonymous_created_idx" ON "smart_links" USING btree ("anonymous_subject_hash","created_at");