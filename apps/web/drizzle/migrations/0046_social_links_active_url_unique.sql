-- Partial unique index on (creator_profile_id, platform, lower(url)) for
-- the active+visible subset. Closes the legacy ingestion gap that allowed
-- duplicate (creator, platform, url) rows to land in the DB and render as
-- "YouTube YouTube YouTube" in the profile preview (JOV-2149).
--
-- Self-healing: soft-deletes any existing duplicates within each
-- (creator_profile_id, platform, lower(url)) group, keeping the most
-- recently updated row active and marking the rest as
-- is_active=false, state='inactive'. The originals are preserved for
-- forensic review — no rows are hard-deleted. This makes the migration
-- safe to run on databases that already hold duplicates.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY creator_profile_id, platform, lower(url)
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM social_links
  WHERE is_active = true AND state = 'active'
)
UPDATE social_links sl
   SET is_active = false,
       state     = 'inactive',
       updated_at = now()
  FROM ranked r
 WHERE sl.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "social_links_creator_platform_url_unique" ON "social_links" USING btree ("creator_profile_id","platform",lower("url")) WHERE is_active = true AND state = 'active';
