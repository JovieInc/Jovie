-- Grandfather releases that were already public before library approval gating.
-- Manual releases created after the approval workflow stay draft until approved.
INSERT INTO "library_asset_approval_statuses" (
  "creator_profile_id",
  "asset_id",
  "item_kind",
  "approval_status"
)
SELECT
  dr."creator_profile_id",
  dr."id"::text,
  'release',
  'approved'
FROM "discog_releases" dr
WHERE dr."deleted_at" IS NULL
  AND dr."status" <> 'draft'
  AND NULLIF(BTRIM(dr."artwork_url"), '') IS NOT NULL
  AND dr."release_date" IS NOT NULL
  AND dr."source_type" <> 'manual'
  AND NOT EXISTS (
    SELECT 1
    FROM "library_asset_approval_statuses" laas
    WHERE laas."creator_profile_id" = dr."creator_profile_id"
      AND laas."asset_id" = dr."id"::text
  )
  AND (
    dr."release_date" <= NOW()
    OR (
      dr."reveal_date" IS NOT NULL
      AND dr."reveal_date" <= NOW()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "provider_links" pl
    WHERE pl."release_id" = dr."id"
      AND pl."owner_type" = 'release'
      AND NULLIF(BTRIM(pl."url"), '') IS NOT NULL
  )
ON CONFLICT ("creator_profile_id", "asset_id") DO NOTHING;