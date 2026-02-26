-- Reclassify historically mis-imported EPs that were stored as singles.
-- Only targets Spotify-origin releases (the source of the misclassification).
-- Safe to run multiple times (idempotent).
UPDATE discog_releases r
SET release_type = 'ep',
    updated_at = NOW()
WHERE r.release_type = 'single'
  AND r.total_tracks BETWEEN 4 AND 6
  AND EXISTS (
    SELECT 1
    FROM provider_links pl
    WHERE pl.release_id = r.id
      AND pl.provider_id = 'spotify'
  );
