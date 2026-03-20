-- Investor Portal schema: token-gated links, view tracking, portal settings
-- Part of investors.jov.ie fundraising engine

-- Pipeline stages enum (idempotent via pg_type check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_stage') THEN
    CREATE TYPE "public"."investor_stage" AS ENUM(
      'shared',
      'viewed',
      'engaged',
      'meeting_booked',
      'committed',
      'wired',
      'passed',
      'declined'
    );
  END IF;
END $$;

-- Shareable token-gated links for investors
CREATE TABLE IF NOT EXISTS "investor_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "email" text,
  "investor_name" text,
  "stage" "investor_stage" DEFAULT 'shared' NOT NULL,
  "engagement_score" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "expires_at" timestamp,
  "last_email_sent_at" timestamp,
  "email_sequence_step" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Granular page view tracking
CREATE TABLE IF NOT EXISTS "investor_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investor_link_id" uuid NOT NULL REFERENCES "investor_links"("id") ON DELETE CASCADE,
  "page_path" text NOT NULL,
  "duration_hint_ms" integer,
  "user_agent" text,
  "referrer" text,
  "viewed_at" timestamp DEFAULT now() NOT NULL
);

-- Portal-level configuration (single row)
CREATE TABLE IF NOT EXISTS "investor_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "show_progress_bar" boolean DEFAULT false NOT NULL,
  "raise_target" integer,
  "committed_amount" integer,
  "investor_count" integer,
  "book_call_url" text,
  "invest_url" text,
  "slack_webhook_url" text,
  "followup_enabled" boolean DEFAULT false NOT NULL,
  "followup_delay_hours" integer DEFAULT 48 NOT NULL,
  "engaged_threshold" integer DEFAULT 50 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_investor_links_token" ON "investor_links" USING btree ("token");
CREATE INDEX IF NOT EXISTS "idx_investor_links_stage" ON "investor_links" USING btree ("stage");
CREATE INDEX IF NOT EXISTS "idx_investor_links_is_active" ON "investor_links" USING btree ("is_active");
CREATE INDEX IF NOT EXISTS "idx_investor_views_link_viewed" ON "investor_views" USING btree ("investor_link_id", "viewed_at");

-- Seed default settings row
INSERT INTO "investor_settings" ("id", "show_progress_bar", "followup_enabled", "followup_delay_hours", "engaged_threshold")
VALUES ('00000000-0000-0000-0000-000000000001', false, false, 48, 50)
ON CONFLICT (id) DO NOTHING;
