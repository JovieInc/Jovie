ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_profile_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_users_active_profile_id" ON "users" USING btree ("active_profile_id") WHERE active_profile_id IS NOT NULL;

-- Backfill active_profile_id for existing users who have claimed profiles.
-- Links each user to their claimed creator_profile via the deprecated user_id FK.
-- Safe: only updates rows where active_profile_id is still NULL.
UPDATE "users" u
SET "active_profile_id" = (
  SELECT cp."id"
  FROM "creator_profiles" cp
  WHERE cp."user_id" = u."id"
    AND cp."is_claimed" = true
  ORDER BY cp."created_at" ASC
  LIMIT 1
)
WHERE u."active_profile_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "creator_profiles" cp
    WHERE cp."user_id" = u."id"
      AND cp."is_claimed" = true
  );

-- Update create_profile_with_user() to set active_profile_id on the user
-- when a new profile is created during onboarding.
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
  PERFORM set_config('app.clerk_user_id', p_clerk_user_id, true);

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

  SELECT id INTO v_profile_id
  FROM creator_profiles
  WHERE user_id = v_user_id
  ORDER BY is_claimed DESC, created_at ASC
  LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    -- Ensure active_profile_id is set for existing profiles (idempotent backfill)
    UPDATE users SET active_profile_id = v_profile_id WHERE id = v_user_id AND active_profile_id IS NULL;
    RETURN v_profile_id;
  END IF;

  v_display_name := COALESCE(NULLIF(TRIM(p_display_name), ''), p_username);

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

  -- Set the active_profile_id on the user
  UPDATE users SET active_profile_id = v_profile_id WHERE id = v_user_id;

  RETURN v_profile_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION create_profile_with_user(text, text, text, text, creator_type)
  IS 'Creates or updates user by clerk_id and creates a creator profile atomically with RLS session set. Sets active_profile_id on the user. Explicitly checks for email conflicts.';
