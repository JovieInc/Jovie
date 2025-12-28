-- Down Migration: Auth Hardening (PR1)
-- Purpose: Rollback auth hardening changes
-- WARNING: This will delete all admin audit log data

-- 1. Drop admin_audit_log indexes
DROP INDEX IF EXISTS "idx_admin_audit_log_action";
DROP INDEX IF EXISTS "idx_admin_audit_log_created_at";
DROP INDEX IF EXISTS "idx_admin_audit_log_target_user_id";
DROP INDEX IF EXISTS "idx_admin_audit_log_admin_user_id";

-- 2. Drop admin_audit_log table
DROP TABLE IF EXISTS "admin_audit_log";

-- 3. Drop users table indexes
DROP INDEX IF EXISTS "idx_users_status";
DROP INDEX IF EXISTS "idx_users_waitlist_entry_id";

-- 4. Drop waitlist_entry_id foreign key and column
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_waitlist_entry_id_fk";
ALTER TABLE "users" DROP COLUMN IF EXISTS "waitlist_entry_id";

-- 5. Drop status column
ALTER TABLE "users" DROP COLUMN IF EXISTS "status";

-- 6. Drop user_status enum
DROP TYPE IF EXISTS "user_status";
