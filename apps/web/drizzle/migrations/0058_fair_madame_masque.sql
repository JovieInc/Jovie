DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'library_asset_approval_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."library_asset_approval_status" AS ENUM('draft', 'needs_review', 'approved', 'archived');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_asset_approval_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"asset_id" text NOT NULL,
	"item_kind" text NOT NULL,
	"approval_status" "library_asset_approval_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_asset_approval_statuses_creator_profile_id_creator_profiles_id_fk'
  ) THEN
    ALTER TABLE "library_asset_approval_statuses"
      ADD CONSTRAINT "library_asset_approval_statuses_creator_profile_id_creator_profiles_id_fk"
      FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_asset_approval_statuses_creator_asset_unique" ON "library_asset_approval_statuses" USING btree ("creator_profile_id","asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_asset_approval_statuses_creator_status_idx" ON "library_asset_approval_statuses" USING btree ("creator_profile_id","approval_status");