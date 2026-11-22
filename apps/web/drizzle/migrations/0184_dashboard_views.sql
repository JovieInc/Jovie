CREATE TABLE IF NOT EXISTS "dashboard_view_versions" (
	"view_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_view_versions_view_id_version_pk" PRIMARY KEY("view_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"share_token" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text NOT NULL,
	"forked_from_view_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_view_versions" ADD CONSTRAINT "dashboard_view_versions_view_id_dashboard_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."dashboard_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_views" ADD CONSTRAINT "dashboard_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_views_share_token_unique" ON "dashboard_views" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_views_owner_user_id_idx" ON "dashboard_views" USING btree ("owner_user_id");