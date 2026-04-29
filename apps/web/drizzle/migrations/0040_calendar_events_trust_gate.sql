-- Calendar + events trust gate
--
-- Adds:
--   - 'admin_import' value to tour_date_provider enum
--   - event_type enum + column on tour_dates (default 'tour')
--   - confirmation_status enum + column on tour_dates (NOT NULL, no DB default)
--   - reviewed_at timestamp column on tour_dates
--   - composite index on (profile_id, confirmation_status) for the review queue
--
-- Provider-aware backfill: existing rows get confirmation_status='confirmed'
-- only if provider='manual' (creator-curated). Synced rows (bandsintown,
-- songkick, admin_import) backfill to 'pending' so the trust gate engages
-- immediately on already-imported third-party data — auto-confirming them
-- would defeat the entire feature.
--
-- The NOT NULL on confirmation_status is enforced via the online-safe
-- CHECK NOT VALID + VALIDATE + SET NOT NULL pattern (see 0029) to avoid
-- ACCESS EXCLUSIVE lock during table scan.
--
-- The application MUST set confirmation_status explicitly on every insert
-- (no DB default by design — see apps/web/lib/events/insert.ts). A future
-- contributor adding a code path that omits it will fail with NOT NULL.

-- 1. Add 'admin_import' value to existing tour_date_provider enum.
ALTER TYPE "public"."tour_date_provider" ADD VALUE IF NOT EXISTS 'admin_import';--> statement-breakpoint

-- 2. Create event_type enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE "public"."event_type" AS ENUM('tour', 'livestream', 'listening_party', 'ama', 'signing');
  END IF;
END $$;--> statement-breakpoint

-- 3. Create confirmation_status enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'confirmation_status') THEN
    CREATE TYPE "public"."confirmation_status" AS ENUM('pending', 'confirmed', 'rejected');
  END IF;
END $$;--> statement-breakpoint

-- 4. Add new columns as nullable initially.
ALTER TABLE "tour_dates" ADD COLUMN IF NOT EXISTS "event_type" "event_type" DEFAULT 'tour' NOT NULL;--> statement-breakpoint
ALTER TABLE "tour_dates" ADD COLUMN IF NOT EXISTS "confirmation_status" "confirmation_status";--> statement-breakpoint
ALTER TABLE "tour_dates" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;--> statement-breakpoint

-- 5. Provider-aware backfill of confirmation_status + reviewed_at.
--    Manual entries are creator-curated and trusted.
UPDATE "tour_dates"
SET "confirmation_status" = 'confirmed', "reviewed_at" = now()
WHERE "provider" = 'manual' AND "confirmation_status" IS NULL;--> statement-breakpoint

--    Synced entries (bandsintown / songkick / admin_import) land in the trust
--    queue. They are invisible to fans + suppressed from notifications until
--    the creator confirms them.
UPDATE "tour_dates"
SET "confirmation_status" = 'pending'
WHERE "provider" IN ('bandsintown', 'songkick', 'admin_import')
  AND "confirmation_status" IS NULL;--> statement-breakpoint

-- 6. Online-safe NOT NULL enforcement on confirmation_status.
ALTER TABLE "tour_dates" ADD CONSTRAINT tour_dates_confirmation_status_not_null
  CHECK ("confirmation_status" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "tour_dates" VALIDATE CONSTRAINT tour_dates_confirmation_status_not_null;--> statement-breakpoint
ALTER TABLE "tour_dates" ALTER COLUMN "confirmation_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tour_dates" DROP CONSTRAINT tour_dates_confirmation_status_not_null;--> statement-breakpoint

-- 7. Composite index for the review queue ("pending events for this profile").
CREATE INDEX IF NOT EXISTS "idx_tour_dates_confirmation_status"
  ON "tour_dates" ("profile_id", "confirmation_status");
