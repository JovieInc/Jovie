-- Migration: Auth Hardening
-- Purpose: Add user status tracking, waitlist linkage, and admin audit logging
-- Rollback: See rollback/0029_auth_hardening_down.sql

-- 1. Create user_status enum (idempotent with DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE "user_status" AS ENUM ('active', 'pending', 'banned');
  END IF;
END $$;

-- 2. Add status column to users table with default 'active'
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "user_status" NOT NULL DEFAULT 'active';

-- 3. Add waitlist_entry_id foreign key to users table
-- This links users to their original waitlist entry for tracking
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "waitlist_entry_id" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_waitlist_entry_id_fk'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_waitlist_entry_id_fk"
      FOREIGN KEY ("waitlist_entry_id") REFERENCES "waitlist_entries"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create index on waitlist_entry_id for efficient lookups
CREATE INDEX IF NOT EXISTS "idx_users_waitlist_entry_id" ON "users" ("waitlist_entry_id");

-- 5. Create index on status for efficient filtering (e.g., finding banned users)
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");

-- 6. Create admin_audit_log table for accountability tracking (idempotent)
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_user_id" uuid NOT NULL,
  "target_user_id" uuid,
  "action" text NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 7. Add foreign key constraints to admin_audit_log (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_audit_log_admin_user_id_fk'
  ) THEN
    ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_fk"
      FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_audit_log_target_user_id_fk'
  ) THEN
    ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_fk"
      FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 8. Create indexes on admin_audit_log for common query patterns
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_admin_user_id" ON "admin_audit_log" ("admin_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target_user_id" ON "admin_audit_log" ("target_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" ("action");
