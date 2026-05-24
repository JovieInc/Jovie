ALTER TABLE "creator_profiles" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "stripe_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "stripe_payout_email" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "stripe_connect_last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "stripe_connect_last_event_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_stripe_account_id" ON "creator_profiles" USING btree ("stripe_account_id") WHERE stripe_account_id IS NOT NULL;