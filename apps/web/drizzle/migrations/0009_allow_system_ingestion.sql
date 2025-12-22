-- Allow system_ingestion to manage creator profiles
DROP POLICY IF EXISTS "creator_profiles_insert_own" ON "public"."creator_profiles";
CREATE POLICY "creator_profiles_insert_own" ON "public"."creator_profiles" FOR INSERT
  WITH CHECK (
    "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

DROP POLICY IF EXISTS "creator_profiles_update_own" ON "public"."creator_profiles";
CREATE POLICY "creator_profiles_update_own" ON "public"."creator_profiles" FOR UPDATE
  USING (
    "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

DROP POLICY IF EXISTS "creator_profiles_delete_own" ON "public"."creator_profiles";
CREATE POLICY "creator_profiles_delete_own" ON "public"."creator_profiles" FOR DELETE
  USING (
    "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text)
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Allow system_ingestion to manage social links
DROP POLICY IF EXISTS "social_links_insert_own" ON "public"."social_links";
CREATE POLICY "social_links_insert_own" ON "public"."social_links" FOR INSERT
  WITH CHECK (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

DROP POLICY IF EXISTS "social_links_update_own" ON "public"."social_links";
CREATE POLICY "social_links_update_own" ON "public"."social_links" FOR UPDATE
  USING (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

DROP POLICY IF EXISTS "social_links_delete_own" ON "public"."social_links";
CREATE POLICY "social_links_delete_own" ON "public"."social_links" FOR DELETE
  USING (
    "creator_profile_id" IN (SELECT "id" FROM "public"."creator_profiles" WHERE "user_id" IN (SELECT "id" FROM "public"."users" WHERE "clerk_id" = current_setting('app.user_id', true)::text))
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );
