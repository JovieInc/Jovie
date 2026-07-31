DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'library_profile_visibility' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."library_profile_visibility" AS ENUM('visible', 'hidden');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "library_asset_approval_statuses"
  ADD COLUMN IF NOT EXISTS "profile_visibility" "library_profile_visibility"
  DEFAULT 'visible' NOT NULL;--> statement-breakpoint
INSERT INTO "library_asset_approval_statuses" (
  "creator_profile_id",
  "asset_id",
  "item_kind",
  "approval_status",
  "profile_visibility"
)
SELECT
  "creator_profile_id",
  'merch-' || "id"::text,
  'merch',
  'draft',
  'hidden'
FROM "merch_cards"
WHERE "visibility_rules" ->> 'public' = 'false'
ON CONFLICT ("creator_profile_id", "asset_id")
DO UPDATE SET
  "profile_visibility" = 'hidden',
  "updated_at" = NOW();--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_asset_approval_statuses_creator_profile_visibility_idx"
  ON "library_asset_approval_statuses" USING btree ("creator_profile_id","profile_visibility");
