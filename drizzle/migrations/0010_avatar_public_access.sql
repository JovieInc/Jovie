-- Avatar public read policy via creator_profiles (public only)
-- Allows logged-out users to see avatars for public profiles while owner access remains

DROP POLICY IF EXISTS "profile_photos_select_public_via_creator" ON "public"."profile_photos";
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
