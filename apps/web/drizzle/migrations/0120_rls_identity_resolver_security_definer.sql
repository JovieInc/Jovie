-- JOV-4195: the merge-group database certification proved that
-- current_app_user_uuid() cannot resolve a users.id session identity for
-- least-privilege roles. The helper is INVOKER and reads "users", which has
-- RLS enabled with clerk_id-only self policies, so a runtime role sees zero
-- rows for a UUID session and every *_owner policy denies the caller's own
-- rows. "users" is ENABLE-only (never FORCE), so the table owner bypasses its
-- RLS; making the resolver SECURITY DEFINER restores identity resolution while
-- callers keep their own row-level visibility everywhere else.
CREATE OR REPLACE FUNCTION current_app_user_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id
  FROM users u
  WHERE u.id::text = NULLIF(current_setting('app.clerk_user_id', true), '')
     OR u.clerk_id = NULLIF(current_setting('app.clerk_user_id', true), '')
  LIMIT 1;
$$;
