ALTER TABLE "creator_profiles" ADD COLUMN "pitch_context" text;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "generated_pitches" jsonb;