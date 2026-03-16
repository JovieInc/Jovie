-- Add search_offset column to discovery_keywords for pagination tracking.
-- Each keyword tracks where in Google CSE results it last searched,
-- so subsequent runs fetch the next page instead of re-fetching page 1.
-- Resets to 1 when the offset exceeds Google CSE max (91).
ALTER TABLE "discovery_keywords"
  ADD COLUMN IF NOT EXISTS "search_offset" integer NOT NULL DEFAULT 1;
