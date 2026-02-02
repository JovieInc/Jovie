-- Migration: Add composite index for fast clerk_id lookups in proxy state check
-- This index covers the WHERE clause in getProxyUserState():
--   WHERE clerk_id = ? AND deleted_at IS NULL AND user_status != 'banned'
--
-- Expected improvement: 1-2s → 50-200ms for proxy state queries

CREATE INDEX IF NOT EXISTS "idx_users_clerk_lookup"
ON "users" ("clerk_id", "deleted_at", "user_status");
