-- Enable Row Level Security for high-PII tables and add ownership-based policies.

CREATE OR REPLACE FUNCTION current_clerk_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.clerk_user_id', true), '');
$$;
--> statement-breakpoint

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audience_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

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
