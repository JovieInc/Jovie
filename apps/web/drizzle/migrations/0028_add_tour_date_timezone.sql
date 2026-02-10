-- Add timezone column to tour_dates for venue timezone display
-- Stores IANA timezone identifiers (e.g., "America/New_York", "Europe/London")

ALTER TABLE "tour_dates"
  ADD COLUMN IF NOT EXISTS "timezone" text;
