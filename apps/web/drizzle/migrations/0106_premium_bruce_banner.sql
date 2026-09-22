DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_qa_disposition') THEN
		CREATE TYPE "public"."merch_qa_disposition" AS ENUM('pending', 'cleared', 'quarantined', 'escalated', 'superseded');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_qa_severity') THEN
		CREATE TYPE "public"."merch_qa_severity" AS ENUM('info', 'warning', 'blocker');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_qa_verdict') THEN
		CREATE TYPE "public"."merch_qa_verdict" AS ENUM('pass', 'fail', 'borderline');
	END IF;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."merch_design_option_status" ADD VALUE IF NOT EXISTS 'quarantined';--> statement-breakpoint
CREATE TABLE "merch_candidate_qa_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_option_id" uuid NOT NULL,
	"merch_card_id" uuid,
	"creator_profile_id" uuid NOT NULL,
	"verdict" "merch_qa_verdict" NOT NULL,
	"severity" "merch_qa_severity" DEFAULT 'info' NOT NULL,
	"reason_codes" text[] DEFAULT '{}' NOT NULL,
	"reviewer_version" text NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"input_hash" text NOT NULL,
	"reference_hash" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"remediation_instruction" text,
	"disposition" "merch_qa_disposition" DEFAULT 'pending' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merch_design_options" ADD COLUMN "remediation_of_option_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_design_options" ADD COLUMN "remediation_instruction" text;--> statement-breakpoint
ALTER TABLE "merch_candidate_qa_reviews" ADD CONSTRAINT "merch_candidate_qa_reviews_design_option_id_merch_design_options_id_fk" FOREIGN KEY ("design_option_id") REFERENCES "public"."merch_design_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_candidate_qa_reviews" ADD CONSTRAINT "merch_candidate_qa_reviews_merch_card_id_merch_cards_id_fk" FOREIGN KEY ("merch_card_id") REFERENCES "public"."merch_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_candidate_qa_reviews" ADD CONSTRAINT "merch_candidate_qa_reviews_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_candidate_qa_reviews_option_created_idx" ON "merch_candidate_qa_reviews" USING btree ("design_option_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_candidate_qa_reviews_creator_disposition_idx" ON "merch_candidate_qa_reviews" USING btree ("creator_profile_id","disposition");--> statement-breakpoint
ALTER TABLE "merch_design_options" ADD CONSTRAINT "merch_design_options_remediation_of_option_id_merch_design_options_id_fk" FOREIGN KEY ("remediation_of_option_id") REFERENCES "public"."merch_design_options"("id") ON DELETE set null ON UPDATE no action;
