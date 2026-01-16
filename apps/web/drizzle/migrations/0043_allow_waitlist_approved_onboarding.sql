-- Migration: Allow waitlist-approved users to complete onboarding
--
-- The stored function in 0037 incorrectly blocks users with 'waitlist_approved' status.
-- These users HAVE been approved from the waitlist and should be allowed to onboard.
--
-- This is an append-only migration - we CREATE OR REPLACE the function.

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
  -- SECURITY CHECK: Verify user has appropriate status before completing onboarding
  -- Check current status (if user exists)
  SELECT user_status INTO v_user_status
  FROM users
  WHERE clerk_id = p_clerk_user_id;

  -- Block only users who haven't been approved from waitlist yet
  -- Allowed states for onboarding:
  --   NULL: New user (will be created by this function)
  --   waitlist_approved: Approved from waitlist, ready to onboard
  --   profile_claimed: Already claimed profile, completing onboarding
  --   onboarding_incomplete: Re-attempting onboarding
  --   active: Re-running onboarding (edge case)
  --
  -- Blocked states:
  --   waitlist_pending: Must be approved first
  --   suspended/banned: Cannot onboard
  IF v_user_status = 'waitlist_pending' THEN
    RAISE EXCEPTION 'User must be approved from waitlist first. Clerk User ID: %, Status: %', p_clerk_user_id, v_user_status
      USING HINT = 'User is still waitlist_pending - admin must approve before onboarding';
  END IF;

  IF v_user_status IN ('suspended', 'banned') THEN
    RAISE EXCEPTION 'User account is suspended or banned. Clerk User ID: %, Status: %', p_clerk_user_id, v_user_status
      USING HINT = 'Contact support for account reinstatement';
  END IF;

  -- Create or update user with appropriate status
  -- Completing onboarding = active status
  INSERT INTO users (clerk_id, email, user_status)
  VALUES (p_clerk_user_id, p_email, 'active')
  ON CONFLICT (clerk_id) DO UPDATE
    SET email = EXCLUDED.email,
        user_status = 'active',
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

-- Update function comment
COMMENT ON FUNCTION create_profile_with_user IS
  'Creates or updates user and profile during onboarding. Allows waitlist_approved users (fixed in 0043).';
