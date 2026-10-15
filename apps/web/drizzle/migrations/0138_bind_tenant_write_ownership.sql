-- JOV-8246: retire the temporary table-owner/null-session bridge for profile,
-- claim, and private billing data. Public profile reads and trusted system
-- ingestion already have explicit policies; tenant writes must name the
-- authenticated owner.

-- This helper deliberately bypasses creator_profiles RLS only to validate the
-- immutable ownership edge used by the user_profile_claims write policy. It
-- exposes no row data and fails closed when the session principal is absent.
CREATE OR REPLACE FUNCTION current_app_user_owns_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_app_user_uuid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM creator_profiles cp
      WHERE cp.id = p_profile_id
        AND cp.user_id = current_app_user_uuid()
    );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION current_app_user_owns_profile(uuid)
  IS 'RLS helper: true only when app.clerk_user_id resolves to the profile user_id owner';
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_profiles_owner_bridge" ON "creator_profiles";
DROP POLICY IF EXISTS "profile_photos_owner_bridge" ON "profile_photos";
DROP POLICY IF EXISTS "user_profile_claims_owner_bridge" ON "user_profile_claims";
DROP POLICY IF EXISTS "billing_audit_log_owner_bridge" ON "billing_audit_log";
DROP POLICY IF EXISTS "stripe_webhook_events_owner_bridge" ON "stripe_webhook_events";
--> statement-breakpoint

-- Authenticated profile creation always binds the new row to the caller.
-- Unowned public profiles are created only by the separate system_* policy.
DROP POLICY IF EXISTS "creator_profiles_insert_owner" ON "creator_profiles";
CREATE POLICY "creator_profiles_insert_owner"
  ON "creator_profiles"
  FOR INSERT
  WITH CHECK (
    current_app_user_uuid() IS NOT NULL
    AND user_id = current_app_user_uuid()
  );
--> statement-breakpoint

-- Claiming an ingestion-created profile is the one authenticated transition
-- from NULL ownership. The resulting row must belong to the session actor.
DROP POLICY IF EXISTS "creator_profiles_claim_authenticated" ON "creator_profiles";
CREATE POLICY "creator_profiles_claim_authenticated"
  ON "creator_profiles"
  FOR UPDATE
  USING (
    current_app_user_uuid() IS NOT NULL
    AND user_id IS NULL
    AND COALESCE(is_claimed, false) = false
  )
  WITH CHECK (user_id = current_app_user_uuid());
--> statement-breakpoint

-- Owners may release only their own unclaimed reservation. This preserves the
-- claim retry cleanup path without restoring a general NULL-owner write.
DROP POLICY IF EXISTS "creator_profiles_release_reservation" ON "creator_profiles";
CREATE POLICY "creator_profiles_release_reservation"
  ON "creator_profiles"
  FOR UPDATE
  USING (
    current_app_user_uuid() IS NOT NULL
    AND user_id = current_app_user_uuid()
    AND COALESCE(is_claimed, false) = false
  )
  WITH CHECK (
    user_id IS NULL
    AND COALESCE(is_claimed, false) = false
  );
--> statement-breakpoint

-- A caller cannot manufacture a claim on somebody else's profile merely by
-- setting user_profile_claims.user_id to their own UUID.
DROP POLICY IF EXISTS "user_profile_claims_write_owner" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_insert_owner" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_update_owner" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_delete_owner" ON "user_profile_claims";

CREATE POLICY "user_profile_claims_insert_owner"
  ON "user_profile_claims"
  FOR INSERT
  WITH CHECK (
    user_id = current_app_user_uuid()
    AND current_app_user_owns_profile(creator_profile_id)
  );

CREATE POLICY "user_profile_claims_update_owner"
  ON "user_profile_claims"
  FOR UPDATE
  USING (
    user_id = current_app_user_uuid()
    AND current_app_user_owns_profile(creator_profile_id)
  )
  WITH CHECK (
    user_id = current_app_user_uuid()
    AND current_app_user_owns_profile(creator_profile_id)
  );

CREATE POLICY "user_profile_claims_delete_owner"
  ON "user_profile_claims"
  FOR DELETE
  USING (
    user_id = current_app_user_uuid()
    AND current_app_user_owns_profile(creator_profile_id)
  );
--> statement-breakpoint

-- Customer-visible billing history is append-only and owned by the current
-- app user. Webhooks, reconciliation, and null-user heartbeat rows continue
-- through billing_audit_log_system_all with an explicit system_* identity.
DROP POLICY IF EXISTS "billing_audit_log_insert_own" ON "billing_audit_log";
CREATE POLICY "billing_audit_log_insert_own"
  ON "billing_audit_log"
  FOR INSERT
  WITH CHECK (
    current_app_user_uuid() IS NOT NULL
    AND user_id = current_app_user_uuid()
  );
