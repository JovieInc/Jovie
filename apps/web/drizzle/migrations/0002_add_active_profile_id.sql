ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_profile_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_users_active_profile_id" ON "users" USING btree ("active_profile_id") WHERE active_profile_id IS NOT NULL;
