CREATE TABLE "profile_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"audience_member_id" uuid,
	"kind" text DEFAULT 'message' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"message" text NOT NULL,
	"visitor_name" text,
	"visitor_email" text,
	"visitor_city" text,
	"originating_question" text,
	"context" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_inquiries" ADD CONSTRAINT "profile_inquiries_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_inquiries_creator_profile_id_created_at_idx" ON "profile_inquiries" USING btree ("creator_profile_id","created_at");