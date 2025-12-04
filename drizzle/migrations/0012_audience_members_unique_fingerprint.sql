-- 0012_audience_members_unique_fingerprint.sql
-- Ensure each creator has at most one audience member per fingerprint.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_audience_members_creator_fingerprint
  ON audience_members (creator_profile_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
