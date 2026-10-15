-- Additive ownership fence; historical NULL owners remain readable/backfillable.
-- Dirty non-null ownership fails validation without rewriting provenance.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_members_id_profile_unique" ON "audience_members" USING btree ("id","creator_profile_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audience_actions" ADD CONSTRAINT "audience_actions_member_profile_fk"
    FOREIGN KEY ("audience_member_id", "creator_profile_id")
    REFERENCES "public"."audience_members"("id", "creator_profile_id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
