-- Clerk → Better Auth migration, build-safe commit ⑤ (server identity flip).
-- Drops the NOT NULL constraint on users.clerk_id so rows provisioned via
-- Better Auth (databaseHooks.user.create.after → provision.ts) can leave
-- clerk_id null while carrying better_auth_user_id. clerk_id stays UNIQUE
-- and is retained one full release as the rollback breadcrumb — the column
-- is NOT dropped here (see docs/auth/better-auth-migration-plan.md).
ALTER TABLE "users" ALTER COLUMN "clerk_id" DROP NOT NULL;
