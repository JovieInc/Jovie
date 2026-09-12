-- Restore the dashboard lookup index from JOV-1036 / #4505.
-- Idempotent: prod may still have the physical index after the schema regression.
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_id_created_at"
  ON "creator_profiles" USING btree ("user_id", "created_at");
