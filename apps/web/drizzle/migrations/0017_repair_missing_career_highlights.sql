-- Repair: on some branches the rename migration was marked applied without the DDL
-- taking effect, leaving creator_profiles.career_highlights missing.
-- Prefer renaming pitch_context when present to preserve data; otherwise add the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'career_highlights'
  ) THEN
    -- No-op: already repaired.
    NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'pitch_context'
  ) THEN
    EXECUTE 'ALTER TABLE "creator_profiles" RENAME COLUMN "pitch_context" TO "career_highlights"';
  ELSE
    EXECUTE 'ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "career_highlights" text';
  END IF;
END
$$;
