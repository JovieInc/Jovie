CREATE TABLE IF NOT EXISTS "activation_pilot_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"arm" text NOT NULL,
	"generation" integer NOT NULL,
	"selection_probability" real NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activation_pilot_baseline_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"source_ref" text NOT NULL,
	"eligible_population" integer,
	"stages" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activation_pilot_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"policy_version" text NOT NULL,
	"spec_digest" text NOT NULL,
	"writeback_digest" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activation_pilot_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"arm" text NOT NULL,
	"surface_version" text NOT NULL,
	"exposed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activation_pilot_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"event" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activation_pilot_assignments_unit_generation_uidx" ON "activation_pilot_assignments" USING btree ("experiment_id","unit_id","generation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_assignments_unit_idx" ON "activation_pilot_assignments" USING btree ("experiment_id","unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_assignments_arm_idx" ON "activation_pilot_assignments" USING btree ("experiment_id","arm");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_baseline_experiment_idx" ON "activation_pilot_baseline_snapshots" USING btree ("experiment_id","captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_decisions_experiment_idx" ON "activation_pilot_decisions" USING btree ("experiment_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activation_pilot_exposures_unit_uidx" ON "activation_pilot_exposures" USING btree ("experiment_id","unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_exposures_arm_idx" ON "activation_pilot_exposures" USING btree ("experiment_id","arm");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activation_pilot_outcomes_unit_event_uidx" ON "activation_pilot_outcomes" USING btree ("experiment_id","unit_id","event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_pilot_outcomes_event_idx" ON "activation_pilot_outcomes" USING btree ("experiment_id","event");