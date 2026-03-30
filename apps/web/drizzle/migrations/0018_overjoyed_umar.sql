-- Deduplicate any existing rows before adding the unique constraint,
-- keeping the most recently updated row per (creator_profile_id, platform).
DELETE FROM social_accounts
WHERE id NOT IN (
  SELECT DISTINCT ON (creator_profile_id, platform) id
  FROM social_accounts
  ORDER BY creator_profile_id, platform, updated_at DESC NULLS LAST
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_social_accounts_profile_platform" ON "social_accounts" USING btree ("creator_profile_id","platform");