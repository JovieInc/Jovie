CREATE TABLE IF NOT EXISTS "workflow_run_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"release_id" text,
	"suggested_action_id" uuid,
	"gmv_delta_cents" integer DEFAULT 0 NOT NULL,
	"click_delta" integer DEFAULT 0 NOT NULL,
	"dsp_click_delta" integer DEFAULT 0 NOT NULL,
	"new_fans_delta" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_outcomes" ADD CONSTRAINT "workflow_run_outcomes_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_outcomes" ADD CONSTRAINT "workflow_run_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_outcomes" ADD CONSTRAINT "workflow_run_outcomes_suggested_action_id_suggested_actions_id_fk" FOREIGN KEY ("suggested_action_id") REFERENCES "public"."suggested_actions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_run_outcomes_workflow_run_id_uniq" ON "workflow_run_outcomes" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_outcomes_user_id_window_end_idx" ON "workflow_run_outcomes" USING btree ("user_id","window_end");