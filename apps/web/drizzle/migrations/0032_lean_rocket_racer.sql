-- Migration: Add users.waitlist_approval for simplified waitlist system
-- Idempotent migration - safe to run multiple times

-- Create enum type with idempotent check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_waitlist_approval') THEN
    CREATE TYPE "public"."user_waitlist_approval" AS ENUM('pending', 'approved');
  END IF;
END $$;

-- Add column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'waitlist_approval'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "waitlist_approval" "user_waitlist_approval";
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS "idx_users_waitlist_approval" ON "users" USING btree ("waitlist_approval");

-- Migrate existing data: users with waitlist_entry_id get 'approved' status
UPDATE "users"
SET "waitlist_approval" = 'approved'
WHERE "waitlist_entry_id" IS NOT NULL
  AND "waitlist_approval" IS NULL;
