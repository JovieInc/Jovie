-- Add RLS policies for profile_photos (owner read/write, system_ingestion, public read via creator)

-- Drop existing select policy to avoid duplicates
DROP POLICY IF EXISTS "profile_photos_select_public_via_creator" ON "public"."profile_photos";

-- Owner-only read/write
DROP POLICY IF EXISTS "profile_photos_select_own" ON "public"."profile_photos";
CREATE POLICY "profile_photos_select_own" ON "public"."profile_photos" FOR SELECT
  USING (
    "user_id" IN (
      SELECT "id" FROM "public"."users"
      WHERE "clerk_id" = current_setting('app.user_id', true)::text
    )
  );

DROP POLICY IF EXISTS "profile_photos_insert_own" ON "public"."profile_photos";
CREATE POLICY "profile_photos_insert_own" ON "public"."profile_photos" FOR INSERT
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "public"."users"
      WHERE "clerk_id" = current_setting('app.user_id', true)::text
    )
  );

DROP POLICY IF EXISTS "profile_photos_update_own" ON "public"."profile_photos";
CREATE POLICY "profile_photos_update_own" ON "public"."profile_photos" FOR UPDATE
  USING (
    "user_id" IN (
      SELECT "id" FROM "public"."users"
      WHERE "clerk_id" = current_setting('app.user_id', true)::text
    )
  );

DROP POLICY IF EXISTS "profile_photos_delete_own" ON "public"."profile_photos";
CREATE POLICY "profile_photos_delete_own" ON "public"."profile_photos" FOR DELETE
  USING (
    "user_id" IN (
      SELECT "id" FROM "public"."users"
      WHERE "clerk_id" = current_setting('app.user_id', true)::text
    )
  );

-- System ingestion bypass (for server jobs)
DROP POLICY IF EXISTS "profile_photos_system_ingestion" ON "public"."profile_photos";
CREATE POLICY "profile_photos_system_ingestion" ON "public"."profile_photos" USING (
  current_setting('app.user_id', true) = 'system_ingestion'
);

-- Public read for public creator profiles
CREATE POLICY "profile_photos_select_public_via_creator" ON "public"."profile_photos" FOR SELECT
  USING (
    "creator_profile_id" IN (
      SELECT "id" FROM "public"."creator_profiles"
      WHERE "is_public" = true
    )
    OR "user_id" IN (
      SELECT "id" FROM "public"."users"
      WHERE "clerk_id" = current_setting('app.user_id', true)::text
    )
  );
