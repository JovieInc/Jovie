ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'chat_started';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'qualified';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'waitlisted';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'signed_up';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "public"."waitlist_status" ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "email_normalized" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "email_hash" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "status_reason" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'waitlist_form';
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "canonical" boolean DEFAULT true;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "qualification_inputs" jsonb;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "qualification_result" jsonb;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_token_expires_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_token_redeemed_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "waitlist_email_status" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "waitlist_email_provider_message_id" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "waitlist_email_last_error" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "waitlist_email_sent_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_email_status" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_email_provider_message_id" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_email_last_error" text;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invite_email_sent_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "qualified_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "waitlisted_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "invited_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "signed_up_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "expired_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp;
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "admin_actor_id" text;

UPDATE "waitlist_entries"
SET
  "email_normalized" = lower(trim("email")),
  "source" = COALESCE("source", 'waitlist_form'),
  "canonical" = COALESCE("canonical", true),
  "waitlisted_at" = CASE
    WHEN "status" = 'new' AND "waitlisted_at" IS NULL THEN "created_at"
    ELSE "waitlisted_at"
  END,
  "approved_at" = CASE
    WHEN "status" IN ('approved', 'invited', 'claimed', 'signed_up') AND "approved_at" IS NULL
      THEN COALESCE("invited_at", "signed_up_at", "updated_at", "created_at")
    ELSE "approved_at"
  END,
  "invited_at" = CASE
    WHEN "status" IN ('invited', 'claimed', 'signed_up') AND "invited_at" IS NULL
      THEN COALESCE("approved_at", "signed_up_at", "updated_at", "created_at")
    ELSE "invited_at"
  END,
  "signed_up_at" = CASE
    WHEN "status" IN ('claimed', 'signed_up') AND "signed_up_at" IS NULL
      THEN COALESCE("invited_at", "approved_at", "updated_at", "created_at")
    ELSE "signed_up_at"
  END
WHERE "email_normalized" IS NULL
  OR "source" IS NULL
  OR "canonical" IS NULL
  OR ("status" = 'new' AND "waitlisted_at" IS NULL)
  OR ("status" IN ('approved', 'invited', 'claimed', 'signed_up') AND "approved_at" IS NULL)
  OR ("status" IN ('invited', 'claimed', 'signed_up') AND "invited_at" IS NULL)
  OR ("status" IN ('claimed', 'signed_up') AND "signed_up_at" IS NULL);

WITH ranked_entries AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY lower(trim("email"))
      ORDER BY
        CASE "status"::text
          WHEN 'claimed' THEN 90
          WHEN 'signed_up' THEN 90
          WHEN 'approved' THEN 80
          WHEN 'invited' THEN 80
          WHEN 'blocked' THEN 75
          WHEN 'rejected' THEN 70
          WHEN 'waitlisted' THEN 50
          WHEN 'qualified' THEN 40
          WHEN 'chat_started' THEN 30
          WHEN 'new' THEN 20
          WHEN 'expired' THEN 10
          ELSE 0
        END DESC,
        "created_at" DESC,
        "id" DESC
    ) AS row_number
  FROM "waitlist_entries"
)
UPDATE "waitlist_entries"
SET "canonical" = false
FROM ranked_entries
WHERE "waitlist_entries"."id" = ranked_entries."id"
  AND ranked_entries.row_number > 1;

ALTER TABLE "waitlist_entries" ALTER COLUMN "email_normalized" SET NOT NULL;
ALTER TABLE "waitlist_entries" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "waitlist_entries" ALTER COLUMN "canonical" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_entries_email_normalized_canonical_unique"
  ON "waitlist_entries" ("email_normalized")
  WHERE "canonical" = true;
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_email_normalized"
  ON "waitlist_entries" ("email_normalized");
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_status_created_at"
  ON "waitlist_entries" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_status_waitlisted_at"
  ON "waitlist_entries" ("status", "waitlisted_at");
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_invite_token_hash"
  ON "waitlist_entries" ("invite_token_hash");

ALTER TABLE "waitlist_settings" ADD COLUMN IF NOT EXISTS "auto_accept_after_days" integer DEFAULT 7;
UPDATE "waitlist_settings"
SET "auto_accept_after_days" = 7
WHERE "auto_accept_after_days" IS NULL
  OR "auto_accept_after_days" < 1
  OR "auto_accept_after_days" > 365;
ALTER TABLE "waitlist_settings" ALTER COLUMN "auto_accept_after_days" SET NOT NULL;
ALTER TABLE "waitlist_settings" DROP CONSTRAINT IF EXISTS "waitlist_settings_auto_accept_after_days_range";
ALTER TABLE "waitlist_settings" ADD CONSTRAINT "waitlist_settings_auto_accept_after_days_range"
  CHECK ("auto_accept_after_days" >= 1 AND "auto_accept_after_days" <= 365);

CREATE TABLE IF NOT EXISTS "waitlist_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "waitlist_entry_id" uuid NOT NULL REFERENCES "waitlist_entries"("id") ON DELETE cascade,
  "actor_user_id" text,
  "actor_type" text DEFAULT 'system' NOT NULL,
  "from_status" "waitlist_status",
  "to_status" "waitlist_status" NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_waitlist_audit_logs_entry_created_at"
  ON "waitlist_audit_logs" ("waitlist_entry_id", "created_at");
