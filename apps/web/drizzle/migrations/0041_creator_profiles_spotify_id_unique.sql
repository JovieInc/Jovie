CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_spotify_id_unique"
  ON "creator_profiles" ("spotify_id")
  WHERE "spotify_id" IS NOT NULL;
