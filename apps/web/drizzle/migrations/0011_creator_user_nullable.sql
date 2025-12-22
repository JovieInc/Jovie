-- Allow unclaimed creators by making user_id nullable on creator_profiles

ALTER TABLE "public"."creator_profiles"
  ALTER COLUMN "user_id" DROP NOT NULL;
