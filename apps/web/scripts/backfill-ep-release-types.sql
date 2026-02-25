-- Reclassify historically mis-imported EPs that were stored as singles.
-- Safe to run multiple times (idempotent).
UPDATE discog_releases
SET release_type = 'ep',
    updated_at = NOW()
WHERE release_type = 'single'
  AND total_tracks BETWEEN 4 AND 6;
