CREATE TABLE IF NOT EXISTS "acquisition_journey_stages" (
	"acquisition_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_journey_stages_acquisition_id_stage_pk" PRIMARY KEY("acquisition_id","stage")
);
--> statement-breakpoint
ALTER TABLE "acquisition_journey_stages" ADD CONSTRAINT "acquisition_journey_stages_acquisition_id_acquisition_journeys_id_fk" FOREIGN KEY ("acquisition_id") REFERENCES "public"."acquisition_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acquisition_journey_stages_stage_occurred_at_idx" ON "acquisition_journey_stages" USING btree ("stage","occurred_at");