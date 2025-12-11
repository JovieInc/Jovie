-- Ensure ingestion_status enum includes 'processing' for ingestion flows
DO $$
BEGIN
  -- Add 'processing' if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ingestion_status' AND e.enumlabel = 'processing'
  ) THEN
    ALTER TYPE "ingestion_status" ADD VALUE IF NOT EXISTS 'processing';
  END IF;

  -- Also add 'pending' if missing (some old enums lacked it)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ingestion_status' AND e.enumlabel = 'pending'
  ) THEN
    ALTER TYPE "ingestion_status" ADD VALUE IF NOT EXISTS 'pending';
  END IF;
END $$;
