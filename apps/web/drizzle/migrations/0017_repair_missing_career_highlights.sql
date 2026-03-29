-- Repair drift where 0015 was recorded but rename DDL never executed.
-- Preserve existing data by renaming when legacy column exists; otherwise add.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'pitch_context'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'career_highlights'
  ) THEN
    ALTER TABLE "creator_profiles" RENAME COLUMN "pitch_context" TO "career_highlights";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'career_highlights'
  ) THEN
    ALTER TABLE "creator_profiles" ADD COLUMN "career_highlights" text;
  END IF;
END
$$;
