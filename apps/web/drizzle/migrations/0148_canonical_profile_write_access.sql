-- JOV-8369: claim SELECT policies hide other accounts' claims. Only a boolean
-- authorization decision may bypass them; never infer "no claims" from a
-- tenant-filtered result. The actor always comes from the pinned DB session.
-- FORCE RLS must never turn a hidden claim into the legacy-owner fallback.
-- Fail migration before activation unless the definer can see the whole graph.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'canonical profile access requires a bypass-capable migration owner';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION current_app_user_can_write_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  WITH actor AS (SELECT public.current_app_user_uuid() AS id)
  SELECT EXISTS (
    SELECT 1 FROM public.creator_profiles cp CROSS JOIN actor
    WHERE cp.id = p_profile_id
      AND actor.id IS NOT NULL
      AND (
        (cp.user_id = actor.id AND NOT EXISTS (
          SELECT 1 FROM public.user_profile_claims claim
          WHERE claim.creator_profile_id = cp.id
        ))
        OR (
          (SELECT count(*) FROM public.user_profile_claims claim
            WHERE claim.creator_profile_id = cp.id
              AND claim.user_id = actor.id
              AND claim.role IN ('owner', 'manager')) = 1
          AND (SELECT count(*) FROM public.user_profile_claims claim
            WHERE claim.creator_profile_id = cp.id
              AND claim.role = 'owner') <= 1
        )
      )
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION current_app_user_can_write_profile(uuid)
  IS 'Session-bound writable claim decision; legacy fallback only with no canonical claims; no row data disclosed';
