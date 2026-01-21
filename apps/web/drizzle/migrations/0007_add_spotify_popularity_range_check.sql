-- Enforce Spotify popularity score range at the database level
-- Popularity is a 0-100 score from Spotify API indicating relative popularity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'discog_releases_spotify_popularity_range'
  ) THEN
    ALTER TABLE "discog_releases"
      ADD CONSTRAINT "discog_releases_spotify_popularity_range"
      CHECK (spotify_popularity >= 0 AND spotify_popularity <= 100);
  END IF;
END $$;
