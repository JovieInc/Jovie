CREATE TABLE IF NOT EXISTS "pmf_survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"response" text,
	"main_benefit" text,
	"answered_at" timestamp with time zone,
	"dismiss_count" integer DEFAULT 0 NOT NULL,
	"last_dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pmf_survey_responses_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "pmf_survey_responses_response_check" CHECK ("pmf_survey_responses"."response" IS NULL OR "pmf_survey_responses"."response" IN ('very_disappointed', 'somewhat_disappointed', 'not_disappointed'))
);
--> statement-breakpoint
ALTER TABLE "pmf_survey_responses" ADD CONSTRAINT "pmf_survey_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;