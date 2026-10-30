-- JOV-5766: youtube_videos.video_id is text (YouTube ID) while
-- youtube_thumbnail_versions.video_id is uuid (FK to youtube_videos.id).
-- Unqualified `v.id = video_id` inside `FROM youtube_videos v` binds to the
-- text column and fails CREATE POLICY with `operator does not exist: uuid = text`.
DROP POLICY IF EXISTS "youtube_thumbnail_versions_private_access" ON "youtube_thumbnail_versions";
--> statement-breakpoint

CREATE POLICY "youtube_thumbnail_versions_private_access" ON "youtube_thumbnail_versions" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id::uuid = "youtube_thumbnail_versions"."video_id"::uuid
      AND can_manage_private_creator_profile(v.creator_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id::uuid = "youtube_thumbnail_versions"."video_id"::uuid
      AND can_manage_private_creator_profile(v.creator_profile_id)
  ));
