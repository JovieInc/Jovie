-- Fix email conflict handling in create_profile_with_user function
-- This migration updates the function to explicitly check for email conflicts
-- before attempting the user upsert, which prevents cryptic constraint errors

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
  -- The ON CONFLICT clause only handles clerk_id conflicts, not email conflicts
  -- If email belongs to a different user, we need to raise a clear error
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
  -- Include user_status since it's NOT NULL with no default
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
    -- Let the caller map specific errors (e.g., unique violations) appropriately
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

--> statement-breakpoint

COMMENT ON FUNCTION create_profile_with_user(text, text, text, text, creator_type)
  IS 'Creates or updates user by clerk_id and creates a creator profile atomically with RLS session set. Explicitly checks for email conflicts.';
