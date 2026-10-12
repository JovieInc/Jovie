-- Founder decision 2026-10-03 (JOV-7701): keep the waitlist gate, with
-- auto-accept. Every gated sign-up gets a waitlist entry at provisioning
-- (source 'signup'), before the intake chat has collected a name or a public
-- link, so those columns become nullable.
ALTER TABLE "waitlist_entries" ALTER COLUMN "full_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "primary_social_url" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "primary_social_platform" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "primary_social_url_normalized" DROP NOT NULL;
--> statement-breakpoint
-- Backfill: pending users without an entry get the same sign-up entry, so
-- they reach review. No email is sent.
INSERT INTO "waitlist_entries" (
  "email", "email_normalized", "email_hash", "source", "canonical",
  "status", "status_reason", "waitlisted_at", "created_at", "updated_at"
)
SELECT DISTINCT ON (lower(trim(u."email")))
  lower(trim(u."email")),
  lower(trim(u."email")),
  encode(sha256(convert_to(lower(trim(u."email")), 'UTF8')), 'hex'),
  'signup', true, 'waitlisted', 'signup_pending_review', now(), now(), now()
FROM "users" u
WHERE u."user_status" = 'waitlist_pending'
  AND u."deleted_at" IS NULL
  AND u."email" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "waitlist_entries" w
    WHERE w."canonical" = true
      AND w."email_normalized" = lower(trim(u."email"))
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Auto-accept ICP entries (artists with a confirmed Spotify profile) up to
-- 10 a day, one day after they are waitlisted. Only flips the closed state
-- prod was left in (auto-accept off, limit 0); an operator's later setting
-- through the admin path is never overwritten.
UPDATE "waitlist_settings"
SET "auto_accept_enabled" = true,
  "auto_accept_daily_limit" = 10,
  "auto_accept_after_days" = 1,
  "updated_at" = now()
WHERE "id" = 1
  AND "auto_accept_enabled" = false
  AND "auto_accept_daily_limit" = 0;
