CREATE TABLE IF NOT EXISTS "release_identity_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_album_id" text NOT NULL,
	"release_id" uuid,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "release_identity_decisions_decision_valid" CHECK (decision IN ('accepted', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "release_identity_decisions" ADD CONSTRAINT "release_identity_decisions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_identity_decisions_creator_album_unique" ON "release_identity_decisions" USING btree ("creator_profile_id","provider_album_id");