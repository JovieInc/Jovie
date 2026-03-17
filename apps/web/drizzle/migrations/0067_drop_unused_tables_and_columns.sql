-- Drop unused tables: dsp_artist_enrichment and release_sync_status
-- These tables were scaffolded but never queried or written to by application code.

DROP TABLE IF EXISTS "dsp_artist_enrichment";
DROP TABLE IF EXISTS "release_sync_status";

-- Drop unused columns from creator_profiles
-- outreach_priority: only referenced in mock data, never set or queried in real code
-- last_login_at: never updated on actual login, never queried for analytics

ALTER TABLE "creator_profiles" DROP COLUMN IF EXISTS "outreach_priority";
ALTER TABLE "creator_profiles" DROP COLUMN IF EXISTS "last_login_at";
