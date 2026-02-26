CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_id_created_at"
  ON "creator_profiles" USING btree ("user_id", "created_at");
