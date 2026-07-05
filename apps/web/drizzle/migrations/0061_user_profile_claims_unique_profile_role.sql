-- JOV-3069: user_profile_claims unique index on creator_profile_id alone blocks
-- multi-role claims. Replace with (creator_profile_id, role) so owner, manager,
-- and viewer rows can coexist for the same profile.
DROP INDEX IF EXISTS "idx_user_profile_claims_unique_profile";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_claims_unique_profile" ON "user_profile_claims" USING btree ("creator_profile_id", "role");