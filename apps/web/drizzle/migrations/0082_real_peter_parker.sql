CREATE TABLE "profile_search_provider_health" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"disabled_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider" text DEFAULT 'google_serpapi' NOT NULL,
	"query_text" text NOT NULL,
	"market" text DEFAULT 'US' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"snippet" text,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"surface_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'intent' NOT NULL,
	"attempt_kind" text DEFAULT 'scheduled' NOT NULL,
	"request_issued_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"error_code" text,
	"error_message" text,
	"comparable" boolean DEFAULT false NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_surface_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"surface_id" uuid,
	"issue_type" text NOT NULL,
	"state" text DEFAULT 'detected' NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"idempotency_key" text NOT NULL,
	"evidence_run_id" uuid,
	"primary_url" text,
	"acted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_search_queries" ADD CONSTRAINT "profile_search_queries_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_search_results" ADD CONSTRAINT "profile_search_results_run_id_profile_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."profile_search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_search_results" ADD CONSTRAINT "profile_search_results_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_search_runs" ADD CONSTRAINT "profile_search_runs_query_id_profile_search_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."profile_search_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_surface_issues" ADD CONSTRAINT "profile_surface_issues_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_surface_issues" ADD CONSTRAINT "profile_surface_issues_surface_id_profile_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."profile_surfaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_surface_issues" ADD CONSTRAINT "profile_surface_issues_evidence_run_id_profile_search_runs_id_fk" FOREIGN KEY ("evidence_run_id") REFERENCES "public"."profile_search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_search_queries_profile_provider_uniq" ON "profile_search_queries" USING btree ("creator_profile_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_search_queries_due_idx" ON "profile_search_queries" USING btree ("next_run_at","creator_profile_id") WHERE enabled = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_search_results_run_position_uniq" ON "profile_search_results" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_search_results_run_url_idx" ON "profile_search_results" USING btree ("run_id","normalized_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_search_results_surface_idx" ON "profile_search_results" USING btree ("surface_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_search_runs_query_fetched_idx" ON "profile_search_runs" USING btree ("query_id","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_search_runs_state_created_idx" ON "profile_search_runs" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_surface_issues_idempotency_uniq" ON "profile_surface_issues" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_surface_issues_unresolved_idx" ON "profile_surface_issues" USING btree ("creator_profile_id","severity","updated_at") WHERE resolved_at IS NULL;
