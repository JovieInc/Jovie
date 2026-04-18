-- Custom Postgres functions and Row Level Security policies.
-- These are hand-written SQL that Drizzle cannot generate from schema files.

-- Helper function for RLS policies: returns the current Clerk user ID from session config.
CREATE OR REPLACE FUNCTION current_clerk_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.clerk_user_id', true), '');
$$;
--> statement-breakpoint

-- Onboarding function: atomically creates or updates a user and their creator profile.
-- Called from apps/web/app/onboarding/actions/profile-setup.ts
CREATE OR REPLACE FUNCTION create_profile_with_user(
  p_clerk_user_id text,
  p_email text,
  p_username text,
  p_display_name text DEFAULT NULL,
  p_creator_type creator_type DEFAULT 'artist'
) RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_display_name text;
  v_existing_email_owner text;
BEGIN
  -- Set session variable for RLS in current transaction scope
  PERFORM set_config('app.clerk_user_id', p_clerk_user_id, true);

  -- Explicit email conflict check BEFORE upsert
  IF p_email IS NOT NULL THEN
    SELECT clerk_id INTO v_existing_email_owner
    FROM users
    WHERE email = p_email AND clerk_id != p_clerk_user_id
    LIMIT 1;

    IF v_existing_email_owner IS NOT NULL THEN
      RAISE EXCEPTION 'EMAIL_IN_USE: Email already belongs to another user'
        USING ERRCODE = '23505',
              DETAIL = 'email',
              HINT = 'The provided email address is already associated with a different account';
    END IF;
  END IF;

  -- Upsert user (by clerk_id)
  INSERT INTO users (clerk_id, email, user_status)
  VALUES (p_clerk_user_id, p_email, 'active')
  ON CONFLICT (clerk_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    user_status = CASE
      WHEN users.user_status IN ('waitlist_pending', 'waitlist_approved', 'onboarding_incomplete', 'profile_claimed')
      THEN 'active'
      ELSE users.user_status
    END,
    updated_at = now()
  RETURNING id INTO v_user_id;

  -- If user already has a profile, return the existing one (idempotent)
  SELECT id INTO v_profile_id
  FROM creator_profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  -- Normalize/compute display name fallback
  v_display_name := COALESCE(NULLIF(TRIM(p_display_name), ''), p_username);

  -- Create the creator profile
  INSERT INTO creator_profiles (
    user_id,
    creator_type,
    username,
    username_normalized,
    display_name,
    is_public,
    is_claimed,
    claimed_at,
    onboarding_completed_at
  ) VALUES (
    v_user_id,
    p_creator_type,
    p_username,
    lower(p_username),
    v_display_name,
    true,
    true,
    now(),
    now()
  ) RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
--> statement-breakpoint

COMMENT ON FUNCTION create_profile_with_user(text, text, text, text, creator_type)
  IS 'Creates or updates user by clerk_id and creates a creator profile atomically with RLS session set. Explicitly checks for email conflicts.';
--> statement-breakpoint

-- Enable Row Level Security on high-PII tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audience_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Users: ownership-based policies
DROP POLICY IF EXISTS "users_select_self" ON "users";
DROP POLICY IF EXISTS "users_update_self" ON "users";
DROP POLICY IF EXISTS "users_insert_self" ON "users";
--> statement-breakpoint

CREATE POLICY "users_select_self"
  ON "users"
  FOR SELECT
  USING ("clerk_id" = current_clerk_user_id());
--> statement-breakpoint

CREATE POLICY "users_update_self"
  ON "users"
  FOR UPDATE
  USING ("clerk_id" = current_clerk_user_id())
  WITH CHECK ("clerk_id" = current_clerk_user_id());
--> statement-breakpoint

CREATE POLICY "users_insert_self"
  ON "users"
  FOR INSERT
  WITH CHECK ("clerk_id" = current_clerk_user_id());
--> statement-breakpoint

-- Audience members: creator-ownership-based policies
DROP POLICY IF EXISTS "audience_members_select_owner" ON "audience_members";
DROP POLICY IF EXISTS "audience_members_update_owner" ON "audience_members";
DROP POLICY IF EXISTS "audience_members_delete_owner" ON "audience_members";
DROP POLICY IF EXISTS "audience_members_insert_any" ON "audience_members";
--> statement-breakpoint

CREATE POLICY "audience_members_select_owner"
  ON "audience_members"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "audience_members_update_owner"
  ON "audience_members"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "audience_members_delete_owner"
  ON "audience_members"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "audience_members_insert_any"
  ON "audience_members"
  FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint

-- Notification subscriptions: creator-ownership-based policies
DROP POLICY IF EXISTS "notification_subscriptions_select_owner" ON "notification_subscriptions";
DROP POLICY IF EXISTS "notification_subscriptions_update_owner" ON "notification_subscriptions";
DROP POLICY IF EXISTS "notification_subscriptions_delete_owner" ON "notification_subscriptions";
DROP POLICY IF EXISTS "notification_subscriptions_insert_any" ON "notification_subscriptions";
--> statement-breakpoint

CREATE POLICY "notification_subscriptions_select_owner"
  ON "notification_subscriptions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "notification_subscriptions_update_owner"
  ON "notification_subscriptions"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "notification_subscriptions_delete_owner"
  ON "notification_subscriptions"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      JOIN "users" u ON u."id" = cp."user_id"
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND u."clerk_id" = current_clerk_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY "notification_subscriptions_insert_any"
  ON "notification_subscriptions"
  FOR INSERT
  WITH CHECK (true);
