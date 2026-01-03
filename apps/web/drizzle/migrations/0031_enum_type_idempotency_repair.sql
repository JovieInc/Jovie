-- Repair migration: Ensure enum types are idempotent
-- This migration fixes potential issues from migrations 0013 and 0020 where
-- DROP TYPE / CREATE TYPE statements were not wrapped in idempotency guards.
-- This is a no-op on databases where types already exist correctly.

-- Ensure photo_status enum exists with correct values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_status') THEN
    CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'processing', 'ready', 'failed');
  END IF;
END $$;

-- Ensure notification_channel enum exists with correct values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'push');
  END IF;
END $$;

-- Ensure contact_role enum exists with correct values (from migration 0006)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_role') THEN
    CREATE TYPE "public"."contact_role" AS ENUM('bookings', 'management', 'press_pr', 'brand_partnerships', 'fan_general', 'other');
  END IF;
END $$;

-- Ensure ingestion_source_type enum exists with correct values (from migration 0006)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_source_type') THEN
    CREATE TYPE "public"."ingestion_source_type" AS ENUM('manual', 'admin', 'ingested');
  END IF;
END $$;

-- Ensure ingestion_status enum exists with correct values (from migration 0006)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
    CREATE TYPE "public"."ingestion_status" AS ENUM('idle', 'pending', 'processing', 'failed');
  END IF;
END $$;
