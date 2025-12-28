-- Migration: Add soft delete support to creator_profiles table
-- Date: 2025-12-28
-- Description: Adds deletedAt timestamp column to creator_profiles table for soft delete functionality
--              This ensures unclaimed profiles are soft-deleted instead of hard-deleted,
--              preserving audit trail for compliance and debugging.

-- Add deletedAt column to creator_profiles table for soft deletes
ALTER TABLE creator_profiles
ADD COLUMN deleted_at TIMESTAMP;

-- Add partial index for filtering out deleted profiles (only indexes non-deleted profiles)
-- This improves query performance when filtering WHERE deleted_at IS NULL
CREATE INDEX idx_creator_profiles_deleted_at ON creator_profiles(deleted_at) WHERE deleted_at IS NULL;
