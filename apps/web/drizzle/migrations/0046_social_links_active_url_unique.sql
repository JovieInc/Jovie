-- Partial unique index on (creator_profile_id, platform, lower(url)) for
-- the active+visible subset. Closes the legacy ingestion gap that allowed
-- duplicate (creator, platform, url) rows to land in the DB and render as
-- "YouTube YouTube YouTube" in the profile preview (JOV-2149).
--
-- Guard block: aborts with a descriptive RAISE if existing data would
-- violate the index. Run `pnpm tsx scripts/audit-duplicate-social-links.ts
-- --apply` first to soft-delete duplicates, then re-run this migration.
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT creator_profile_id, platform, lower(url) AS norm_url
    FROM social_links
    WHERE is_active = true AND state = 'active'
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) t;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % duplicate (creator_profile_id, platform, lower(url)) groups exist in social_links. Run apps/web/scripts/audit-duplicate-social-links.ts --apply first.',
      dup_groups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "social_links_creator_platform_url_unique" ON "social_links" USING btree ("creator_profile_id","platform",lower("url")) WHERE is_active = true AND state = 'active';
