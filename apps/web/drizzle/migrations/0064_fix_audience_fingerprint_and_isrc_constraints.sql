-- Fix Issue 1: Re-create the unique constraint on audience_members that was
-- dropped in migration 0001 and never restored. The onConflictDoNothing in
-- the audience visit route depends on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "audience_members_creator_profile_id_fingerprint_unique"
  ON "audience_members" ("creator_profile_id", "fingerprint");

-- Fix Issue 2: The global ISRC unique constraint is too strict — the same ISRC
-- can legitimately appear across re-releases (same song on different albums).
-- Replace with a per-release unique constraint so upserts on
-- (release_id, disc_number, track_number) no longer hit ISRC violations.
DROP INDEX IF EXISTS "discog_tracks_isrc_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_isrc_unique"
  ON "discog_tracks" ("release_id", "isrc") WHERE "isrc" IS NOT NULL;
