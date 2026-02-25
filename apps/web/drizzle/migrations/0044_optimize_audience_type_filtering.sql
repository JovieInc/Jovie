CREATE INDEX IF NOT EXISTS "audience_members_creator_profile_id_type_last_seen_at_idx"
  ON "audience_members" USING btree ("creator_profile_id", "type", "last_seen_at");
