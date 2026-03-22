-- Repair: columns from migrations 0003 and 0005 were recorded as applied
-- but the ALTER TABLE DDL never executed (Drizzle journal drift from v1 squash).
-- Uses IF NOT EXISTS so this is safe on environments where the columns already exist.
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "discovered_pixels" jsonb;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "discovered_pixels_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "pitch_context" text;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN IF NOT EXISTS "generated_pitches" jsonb;
