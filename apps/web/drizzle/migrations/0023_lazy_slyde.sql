DROP INDEX IF EXISTS "artist_brand_kits_profile_default_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_art_sessions_cleanup_idx" ON "album_art_generation_sessions" USING btree ("expires_at") WHERE "album_art_generation_sessions"."status" <> 'applied';--> statement-breakpoint
WITH ranked_default_brand_kits AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "profile_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "default_rank"
  FROM "artist_brand_kits"
  WHERE "is_default" = true
)
UPDATE "artist_brand_kits"
SET "is_default" = false,
    "updated_at" = NOW()
WHERE "id" IN (
  SELECT "id"
  FROM ranked_default_brand_kits
  WHERE "default_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artist_brand_kits_profile_default_unique_idx" ON "artist_brand_kits" USING btree ("profile_id") WHERE "artist_brand_kits"."is_default" = true;
