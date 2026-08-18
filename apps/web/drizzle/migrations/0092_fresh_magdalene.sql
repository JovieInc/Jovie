CREATE TABLE "creator_contact_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"responsibility_id" uuid NOT NULL,
	"territories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_contact_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"display_name" text,
	"company_name" text,
	"email" text,
	"phone" text,
	"preferred_channel" "contact_channel",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_contact_responsibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"role" "contact_role" NOT NULL,
	"custom_label" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "routed_to_contact_person_id" uuid;--> statement-breakpoint
ALTER TABLE "creator_contact_assignments" ADD CONSTRAINT "creator_contact_assignments_person_id_creator_contact_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."creator_contact_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contact_assignments" ADD CONSTRAINT "creator_contact_assignments_responsibility_id_creator_contact_responsibilities_id_fk" FOREIGN KEY ("responsibility_id") REFERENCES "public"."creator_contact_responsibilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contact_people" ADD CONSTRAINT "creator_contact_people_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contact_responsibilities" ADD CONSTRAINT "creator_contact_responsibilities_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_contact_assignments_person_responsibility" ON "creator_contact_assignments" USING btree ("person_id","responsibility_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_contact_assignments_responsibility_selection" ON "creator_contact_assignments" USING btree ("responsibility_id","is_active","is_primary","sort_order","created_at","person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_contact_people_profile" ON "creator_contact_people" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_contact_responsibilities_profile_role_label" ON "creator_contact_responsibilities" USING btree ("creator_profile_id","role","custom_label");--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_routed_to_contact_person_id_creator_contact_people_id_fk" FOREIGN KEY ("routed_to_contact_person_id") REFERENCES "public"."creator_contact_people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Expand/backfill/read-cutover: retain creator_contacts and its original
-- email_threads foreign key so this migration is reversible without losing
-- legacy contact data. Person IDs deliberately reuse legacy IDs, which makes
-- correspondence backfill exact and auditable.
INSERT INTO "creator_contact_people" (
  "id",
  "creator_profile_id",
  "display_name",
  "company_name",
  "email",
  "phone",
  "preferred_channel",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "creator_profile_id",
  "person_name",
  "company_name",
  "email",
  "phone",
  "preferred_channel",
  "created_at",
  "updated_at"
FROM "creator_contacts"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "creator_contact_responsibilities" (
  "creator_profile_id",
  "role",
  "custom_label",
  "created_at",
  "updated_at"
)
SELECT DISTINCT ON (
  "creator_profile_id",
  "role",
  COALESCE("custom_label", '')
)
  "creator_profile_id",
  "role",
  COALESCE("custom_label", ''),
  "created_at",
  "updated_at"
FROM "creator_contacts"
ORDER BY
  "creator_profile_id",
  "role",
  COALESCE("custom_label", ''),
  "created_at",
  "id"
ON CONFLICT ("creator_profile_id", "role", "custom_label") DO NOTHING;
--> statement-breakpoint
WITH ranked_legacy_contacts AS (
  SELECT
    "id",
    "creator_profile_id",
    "role",
    COALESCE("custom_label", '') AS "custom_label",
    "territories",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
    ROW_NUMBER() OVER (
      PARTITION BY
        "creator_profile_id",
        "role",
        COALESCE("custom_label", '')
      ORDER BY "sort_order", "created_at", "id"
    ) AS "responsibility_rank"
  FROM "creator_contacts"
)
INSERT INTO "creator_contact_assignments" (
  "person_id",
  "responsibility_id",
  "territories",
  "is_active",
  "is_primary",
  "sort_order",
  "started_at",
  "ended_at",
  "created_at",
  "updated_at"
)
SELECT
  legacy."id",
  responsibility."id",
  COALESCE(legacy."territories", '[]'::jsonb),
  COALESCE(legacy."is_active", true),
  legacy."responsibility_rank" = 1,
  COALESCE(legacy."sort_order", 0),
  legacy."created_at",
  CASE
    WHEN COALESCE(legacy."is_active", true) THEN NULL
    ELSE legacy."updated_at"
  END,
  legacy."created_at",
  legacy."updated_at"
FROM ranked_legacy_contacts AS legacy
INNER JOIN "creator_contact_responsibilities" AS responsibility
  ON responsibility."creator_profile_id" = legacy."creator_profile_id"
  AND responsibility."role" = legacy."role"
  AND responsibility."custom_label" = legacy."custom_label"
ON CONFLICT ("person_id", "responsibility_id") DO NOTHING;
--> statement-breakpoint
UPDATE "email_threads"
SET "routed_to_contact_person_id" = "routed_to_contact_id"
WHERE "routed_to_contact_id" IS NOT NULL
  AND "routed_to_contact_person_id" IS NULL;
