-- Add Spotify popularity score column to discog_releases
-- Popularity is a 0-100 score from Spotify API indicating relative popularity
ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "spotify_popularity" integer;
