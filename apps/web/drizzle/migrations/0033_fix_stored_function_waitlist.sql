-- Migration: Fix create_profile_with_user to add waitlist security check and set waitlistApproval
-- This fixes critical security vulnerability allowing waitlist bypass

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
  v_waitlist_approval user_waitlist_approval;
BEGIN
  -- SECURITY CHECK: Verify user has waitlist approval before creating profile
  SELECT waitlist_approval INTO v_waitlist_approval
  FROM users
  WHERE clerk_id = p_clerk_user_id;

  -- If user doesn't exist or isn't approved, reject the operation
  IF v_waitlist_approval IS NULL OR v_waitlist_approval != 'approved' THEN
    RAISE EXCEPTION 'User must be waitlist approved before creating profile. Clerk User ID: %', p_clerk_user_id
      USING HINT = 'User must complete waitlist approval flow before onboarding';
  END IF;

  -- Create or update user with waitlist_approval='approved'
  INSERT INTO users (clerk_id, email, waitlist_approval)
  VALUES (p_clerk_user_id, p_email, 'approved')
  ON CONFLICT (clerk_id) DO UPDATE
    SET email = EXCLUDED.email,
        waitlist_approval = 'approved',  -- Ensure it's set even on conflict
        updated_at = now()
  RETURNING id INTO v_user_id;

  -- Create the creator profile
  INSERT INTO creator_profiles (
    user_id,
    username,
    display_name,
    creator_type,
    is_claimed
  )
  VALUES (
    v_user_id,
    p_username,
    COALESCE(p_display_name, p_username),
    p_creator_type,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        creator_type = EXCLUDED.creator_type,
        is_claimed = true,
        updated_at = now()
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
