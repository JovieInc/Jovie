ALTER TYPE "public"."photo_status" ADD VALUE IF NOT EXISTS 'draft' BEFORE 'uploading';--> statement-breakpoint
CREATE TABLE "audience_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"audience_member_id" uuid,
	"fingerprint" text NOT NULL,
	"email" text,
	"display_name" text,
	"geo_city" text,
	"geo_country" text,
	"reason" text,
	"blocked_at" timestamp DEFAULT now() NOT NULL,
	"unblocked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "audience_blocks" ADD CONSTRAINT "audience_blocks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_blocks" ADD CONSTRAINT "audience_blocks_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_blocks_profile_fingerprint_active" ON "audience_blocks" USING btree ("creator_profile_id","fingerprint") WHERE unblocked_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audience_blocks_profile_email_active" ON "audience_blocks" USING btree ("creator_profile_id","email") WHERE email IS NOT NULL AND unblocked_at IS NULL;