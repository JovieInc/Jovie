-- Migration: Update stored procedures to use user_status instead of deprecated fields
-- This updates create_profile_with_user to use the new userStatus lifecycle enum

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
  v_user_status user_status_lifecycle;
BEGIN
  -- SECURITY CHECK: Verify user has appropriate status before creating profile
  -- User must be at least 'profile_claimed' or beyond to create a profile
  SELECT user_status INTO v_user_status
  FROM users
  WHERE clerk_id = p_clerk_user_id;

  -- If user doesn't exist or hasn't claimed a profile yet, reject the operation
  IF v_user_status IS NULL OR v_user_status IN ('waitlist_pending', 'waitlist_approved') THEN
    RAISE EXCEPTION 'User must claim profile before completing onboarding. Clerk User ID: %, Status: %', p_clerk_user_id, COALESCE(v_user_status::text, 'NULL')
      USING HINT = 'User must complete waitlist approval and claim flow before onboarding';
  END IF;

  -- Create or update user with appropriate status
  -- If they're calling this, they're completing onboarding, so set to 'active'
  INSERT INTO users (clerk_id, email, user_status)
  VALUES (p_clerk_user_id, p_email, 'active')
  ON CONFLICT (clerk_id) DO UPDATE
    SET email = EXCLUDED.email,
        user_status = 'active',  -- Completing onboarding = active
        updated_at = now()
  RETURNING id INTO v_user_id;

  -- Create the creator profile
  INSERT INTO creator_profiles (
    user_id,
    username,
    display_name,
    creator_type,
    is_claimed,
    onboarding_completed_at
  )
  VALUES (
    v_user_id,
    p_username,
    COALESCE(p_display_name, p_username),
    p_creator_type,
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        creator_type = EXCLUDED.creator_type,
        is_claimed = true,
        onboarding_completed_at = COALESCE(creator_profiles.onboarding_completed_at, now()),
        updated_at = now()
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Add comment to document the migration
COMMENT ON FUNCTION create_profile_with_user IS
  'Creates or updates user and profile during onboarding. Uses user_status lifecycle enum (migrated from waitlist_approval in 0037).';
