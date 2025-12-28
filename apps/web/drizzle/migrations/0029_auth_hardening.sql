-- Auth Hardening Migration
-- PR1: Schema changes for centralized auth gate and admin audit logging
--
-- Changes:
-- 1. Add user_status enum and status column to users table
-- 2. Add waitlist_entry_id FK to users table (links user to their waitlist entry)
-- 3. Add is_primary column to creator_profiles (future-proof for multi-profile)
-- 4. Create admin_audit_log table for tracking all admin actions
--
-- Rollback: See bottom of file for rollback statements

-- Step 1: Create user_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('active', 'pending', 'banned', 'deactivated');
  END IF;
END$$;

-- Step 2: Add status column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';

-- Step 3: Add waitlist_entry_id FK to users table
-- This links users to their original waitlist entry for historical tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS waitlist_entry_id UUID REFERENCES waitlist_entries(id) ON DELETE SET NULL;

-- Create index for waitlist_entry_id lookups
CREATE INDEX IF NOT EXISTS idx_users_waitlist_entry_id ON users(waitlist_entry_id)
  WHERE waitlist_entry_id IS NOT NULL;

-- Step 4: Add is_primary column to creator_profiles
-- Future-proofs for multi-profile support (1 user → many profiles, one primary)
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Set existing claimed profiles as primary (migration for existing data)
-- Only set is_primary for profiles that are claimed and belong to a user
UPDATE creator_profiles
SET is_primary = true
WHERE user_id IS NOT NULL
  AND is_claimed = true
  AND is_primary = false;

-- Create index for efficient primary profile lookup per user
CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id_is_primary ON creator_profiles(user_id, is_primary)
  WHERE user_id IS NOT NULL;

-- Step 5: Create admin_audit_log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_profile_id UUID REFERENCES creator_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT, -- Required for certain actions (impersonation, waitlist bypass)
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for admin_audit_log queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user_id ON admin_audit_log(target_user_id)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_profile_id ON admin_audit_log(target_profile_id)
  WHERE target_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE admin_audit_log IS 'Tracks all admin actions for security auditing and compliance';
COMMENT ON COLUMN admin_audit_log.reason IS 'Required for sensitive actions: impersonation, waitlist bypass, role changes';
COMMENT ON COLUMN users.status IS 'User account status: active (normal), pending (awaiting verification), banned (blocked), deactivated (soft-deleted)';
COMMENT ON COLUMN users.waitlist_entry_id IS 'Links to original waitlist entry for historical tracking';
COMMENT ON COLUMN creator_profiles.is_primary IS 'Whether this is the users primary profile (for future multi-profile support)';

-- Enable RLS on admin_audit_log (admin-only access)
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can read audit logs
CREATE POLICY admin_audit_log_read_policy ON admin_audit_log
  FOR SELECT
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.clerk_id = current_setting('app.clerk_user_id', true)
        AND users.is_admin = true
    )
  );

-- RLS Policy: Only admins can insert audit logs
CREATE POLICY admin_audit_log_insert_policy ON admin_audit_log
  FOR INSERT
  TO PUBLIC
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.clerk_id = current_setting('app.clerk_user_id', true)
        AND users.is_admin = true
    )
  );

-- ============================================================================
-- ROLLBACK STATEMENTS (run manually if needed)
-- ============================================================================
-- DROP POLICY IF EXISTS admin_audit_log_insert_policy ON admin_audit_log;
-- DROP POLICY IF EXISTS admin_audit_log_read_policy ON admin_audit_log;
-- DROP TABLE IF EXISTS admin_audit_log;
-- DROP INDEX IF EXISTS idx_creator_profiles_user_id_is_primary;
-- ALTER TABLE creator_profiles DROP COLUMN IF EXISTS is_primary;
-- DROP INDEX IF EXISTS idx_users_waitlist_entry_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS waitlist_entry_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS status;
-- DROP TYPE IF EXISTS user_status;
