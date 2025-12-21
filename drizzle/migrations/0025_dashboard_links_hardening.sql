-- Dashboard Links Hardening Migration
-- Adds optimistic locking and idempotency key support for link management

--------------------------------------------------------------------------------
-- ADD VERSION COLUMN TO SOCIAL_LINKS
--------------------------------------------------------------------------------

-- Add version column for optimistic locking (default 1 for existing rows)
ALTER TABLE "public"."social_links"
ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;

--------------------------------------------------------------------------------
-- CREATE DASHBOARD IDEMPOTENCY KEYS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."dashboard_idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "user_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "response_status" integer NOT NULL,
  "response_body" jsonb,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraint on key + user_id + endpoint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_idempotency_keys_key_user_endpoint_unique"
ON "public"."dashboard_idempotency_keys" USING btree ("key", "user_id", "endpoint");

-- Index for cleanup of expired keys
CREATE INDEX IF NOT EXISTS "dashboard_idempotency_keys_expires_at_idx"
ON "public"."dashboard_idempotency_keys" USING btree ("expires_at");

--------------------------------------------------------------------------------
-- COMMENT DOCUMENTATION
--------------------------------------------------------------------------------

COMMENT ON COLUMN "public"."social_links"."version" IS
  'Optimistic locking version - incremented on each update to detect concurrent modifications';

COMMENT ON TABLE "public"."dashboard_idempotency_keys" IS
  'Stores idempotency keys for dashboard API endpoints to prevent duplicate processing of retry requests';
