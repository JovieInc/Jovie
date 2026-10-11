CREATE TABLE "acquisition_journeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"first_touch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_state" text NOT NULL,
	"identity_scope" text DEFAULT 'consented_first_party_browser' NOT NULL,
	"captured_at" timestamp NOT NULL,
	"linked_at" timestamp,
	"consent_revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "acquisition_id" uuid;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "acquisition_journeys" ADD CONSTRAINT "acquisition_journeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acquisition_journeys_user_id_unique" ON "acquisition_journeys" USING btree ("user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acquisition_journeys_captured_at_idx" ON "acquisition_journeys" USING btree ("captured_at");--> statement-breakpoint
ALTER TABLE "pixel_events" ADD CONSTRAINT "pixel_events_acquisition_id_acquisition_journeys_id_fk" FOREIGN KEY ("acquisition_id") REFERENCES "public"."acquisition_journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD CONSTRAINT "pixel_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_acquisition_id" ON "pixel_events" USING btree ("acquisition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_user_id" ON "pixel_events" USING btree ("user_id");
