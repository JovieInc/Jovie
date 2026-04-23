ALTER TABLE "discog_recordings" ADD COLUMN IF NOT EXISTS "waveform_peaks" jsonb;
