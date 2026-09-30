CREATE TABLE "contact_evidence_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"evidence_key" text NOT NULL,
	"evidence_revision" text NOT NULL,
	"decision" text NOT NULL,
	"candidate_snapshot" jsonb NOT NULL,
	"correction" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_profile_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"evidence_revision" text NOT NULL,
	"coverage_snapshot" jsonb NOT NULL,
	"actor_user_id" uuid,
	"certified_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_evidence_reviews" ADD CONSTRAINT "contact_evidence_reviews_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_evidence_reviews" ADD CONSTRAINT "contact_evidence_reviews_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_profile_certifications" ADD CONSTRAINT "contact_profile_certifications_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_profile_certifications" ADD CONSTRAINT "contact_profile_certifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_evidence_reviews_contact_evidence_created" ON "contact_evidence_reviews" USING btree ("contact_id","evidence_key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_evidence_reviews_dedupe_key" ON "contact_evidence_reviews" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_profile_certifications_contact_revision_unique" ON "contact_profile_certifications" USING btree ("contact_id","evidence_revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_profile_certifications_contact_certified" ON "contact_profile_certifications" USING btree ("contact_id","certified_at");
