-- Speed up collision-safe public alias misses against the legacy track table.
-- The alias resolver probes by creator and slug; this table is intentionally
-- non-unique because legacy tracks may reuse a slug across releases.
CREATE INDEX IF NOT EXISTS "discog_tracks_creator_slug_idx"
  ON "discog_tracks" ("creator_profile_id", "slug");
