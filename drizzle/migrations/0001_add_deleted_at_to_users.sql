-- Migration: Add soft delete support to users table
-- Date: 2025-12-06
-- Description: Adds deletedAt timestamp column to users table for soft delete functionality

-- Add deletedAt column to users table for soft deletes
ALTER TABLE users
ADD COLUMN deleted_at TIMESTAMP;

-- Add partial index for filtering out deleted users (only indexes non-deleted users)
-- This improves query performance when filtering WHERE deleted_at IS NULL
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;
