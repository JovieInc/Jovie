ALTER TYPE "public"."ingestion_job_status" ADD VALUE IF NOT EXISTS 'held_for_approval' AFTER 'failed';
