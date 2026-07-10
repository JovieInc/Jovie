-- Realign RLS policies with the post-Better-Auth session identity (JOV-4194 / GH #13930).
--
-- Context: the app sets the RLS session variable `app.clerk_user_id`
-- (apps/web/lib/auth/session.ts, lib/db/client/session.ts) to the app
-- `users.id` UUID since the Clerk -> Better Auth cutover (0072/0073).
-- The 0001/0036 policies still compared `users.clerk_id` to that value,
-- so their predicates could never match — production RLS was inert.
--
-- This migration:
--   1. Adds `current_app_user_id()` — a uuid-safe reader of the same
--      session variable. Non-uuid values (legacy Clerk ids, empty string)
--      resolve to NULL, which denies rather than errors.
--   2. Recreates all existing policies to compare `users.id` to it.
--   3. Extends RLS coverage to `creator_profiles` and `profile_photos`
--      (previously no production RLS at all).
--
-- FORCE ROW LEVEL SECURITY is intentionally NOT applied: the application
-- connects as the table-owner role, and many legitimate server paths
-- (webhooks, cron, auth bootstrap, `create_profile_with_user`) query these
-- tables before or without an authenticated RLS session. Forcing RLS here
-- without a full runtime audit of those paths would be an outage risk.
-- RLS is therefore defense-in-depth for non-owner/non-BYPASSRLS roles;
-- policy correctness is proven by tests/integration/rls-access-control.test.ts
-- using a NOBYPASSRLS role. Flipping to FORCE (or moving the app off the
-- owner role) is tracked as follow-up work on JOV-4194.

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('app.clerk_user_id', true)
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN current_setting('app.clerk_user_id', true)::uuid
    ELSE NULL
  END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION current_app_user_id()
  IS 'Returns the authenticated app users.id UUID from the app.clerk_user_id session variable (set by lib/auth/session.ts). NULL when unset or not a UUID. RLS policies must compare users.id (not clerk_id) to this.';
--> statement-breakpoint

-- Users: ownership-based policies keyed on users.id
DROP POLICY IF EXISTS "users_select_self" ON "users";
DROP POLICY IF EXISTS "users_update_self" ON "users";
DROP POLICY IF EXISTS "users_insert_self" ON "users";
--> statement-breakpoint

CREATE POLICY "users_select_self"
  ON "users"
  FOR SELECT
  USING ("id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "users_update_self"
  ON "users"
  FOR UPDATE
  USING ("id" = current_app_user_id())
  WITH CHECK ("id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "users_insert_self"
  ON "users"
  FOR INSERT
  WITH CHECK ("id" = current_app_user_id());
--> statement-breakpoint

-- Audience members: creator-ownership keyed on users.id
DROP POLICY IF EXISTS "audience_members_select_owner" ON "audience_members";
DROP POLICY IF EXISTS "audience_members_update_owner" ON "audience_members";
DROP POLICY IF EXISTS "audience_members_delete_owner" ON "audience_members";
--> statement-breakpoint

CREATE POLICY "audience_members_select_owner"
  ON "audience_members"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
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
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
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
      WHERE cp."id" = "audience_members"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
    )
  );
--> statement-breakpoint

-- Notification subscriptions: creator-ownership keyed on users.id
DROP POLICY IF EXISTS "notification_subscriptions_select_owner" ON "notification_subscriptions";
DROP POLICY IF EXISTS "notification_subscriptions_update_owner" ON "notification_subscriptions";
DROP POLICY IF EXISTS "notification_subscriptions_delete_owner" ON "notification_subscriptions";
--> statement-breakpoint

CREATE POLICY "notification_subscriptions_select_owner"
  ON "notification_subscriptions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
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
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
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
      WHERE cp."id" = "notification_subscriptions"."creator_profile_id"
        AND cp."user_id" = current_app_user_id()
    )
  );
--> statement-breakpoint

-- User interviews (0036): ownership keyed on users.id
DROP POLICY IF EXISTS "user_interviews_select_own" ON "user_interviews";
DROP POLICY IF EXISTS "user_interviews_insert_own" ON "user_interviews";
--> statement-breakpoint

CREATE POLICY "user_interviews_select_own"
  ON "user_interviews"
  FOR SELECT
  USING ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "user_interviews_insert_own"
  ON "user_interviews"
  FOR INSERT
  WITH CHECK ("user_id" = current_app_user_id());
--> statement-breakpoint

-- Creator profiles: previously had NO production RLS.
ALTER TABLE "creator_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_profiles_select_public" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_select_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_update_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_insert_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_delete_owner" ON "creator_profiles";
--> statement-breakpoint

CREATE POLICY "creator_profiles_select_public"
  ON "creator_profiles"
  FOR SELECT
  USING ("is_public" = true);
--> statement-breakpoint

CREATE POLICY "creator_profiles_select_owner"
  ON "creator_profiles"
  FOR SELECT
  USING ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "creator_profiles_update_owner"
  ON "creator_profiles"
  FOR UPDATE
  USING ("user_id" = current_app_user_id())
  WITH CHECK ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "creator_profiles_insert_owner"
  ON "creator_profiles"
  FOR INSERT
  WITH CHECK ("user_id" = current_app_user_id() OR "user_id" IS NULL);
--> statement-breakpoint

CREATE POLICY "creator_profiles_delete_owner"
  ON "creator_profiles"
  FOR DELETE
  USING ("user_id" = current_app_user_id());
--> statement-breakpoint

-- Profile photos: previously had NO production RLS.
ALTER TABLE "profile_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "profile_photos_select_public" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_select_owner" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_update_owner" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_insert_owner" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_delete_owner" ON "profile_photos";
--> statement-breakpoint

CREATE POLICY "profile_photos_select_public"
  ON "profile_photos"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "creator_profiles" cp
      WHERE cp."id" = "profile_photos"."creator_profile_id"
        AND cp."is_public" = true
    )
  );
--> statement-breakpoint

CREATE POLICY "profile_photos_select_owner"
  ON "profile_photos"
  FOR SELECT
  USING ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "profile_photos_update_owner"
  ON "profile_photos"
  FOR UPDATE
  USING ("user_id" = current_app_user_id())
  WITH CHECK ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "profile_photos_insert_owner"
  ON "profile_photos"
  FOR INSERT
  WITH CHECK ("user_id" = current_app_user_id());
--> statement-breakpoint

CREATE POLICY "profile_photos_delete_owner"
  ON "profile_photos"
  FOR DELETE
  USING ("user_id" = current_app_user_id());
