-- Email Engagement Table
-- Tracks opens and clicks for email campaigns

CREATE TABLE IF NOT EXISTS "email_engagement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email_type" text NOT NULL,
  "event_type" text NOT NULL,
  "reference_id" uuid NOT NULL,
  "recipient_hash" text NOT NULL,
  "provider_message_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_engagement_reference_idx" ON "email_engagement" USING btree ("reference_id");
CREATE INDEX IF NOT EXISTS "email_engagement_recipient_idx" ON "email_engagement" USING btree ("recipient_hash");
CREATE INDEX IF NOT EXISTS "email_engagement_email_type_idx" ON "email_engagement" USING btree ("email_type");
CREATE INDEX IF NOT EXISTS "email_engagement_created_at_idx" ON "email_engagement" USING btree ("created_at");

-- Unique index for deduplicating opens (only count first open per email)
CREATE UNIQUE INDEX IF NOT EXISTS "email_engagement_unique_open_idx"
  ON "email_engagement" ("email_type", "reference_id", "recipient_hash")
  WHERE "event_type" = 'open';

--> statement-breakpoint

-- Campaign Sequences Table
-- Defines multi-step email campaigns (drip sequences)

CREATE TABLE IF NOT EXISTS "campaign_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "is_active" text DEFAULT 'true' NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "campaign_sequences_campaign_key_idx" ON "campaign_sequences" USING btree ("campaign_key");

--> statement-breakpoint

-- Campaign Enrollments Table
-- Tracks which recipients are enrolled in which campaigns

CREATE TABLE IF NOT EXISTS "campaign_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_sequence_id" uuid NOT NULL REFERENCES "campaign_sequences"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL,
  "recipient_hash" text NOT NULL,
  "current_step" text DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "stop_reason" text,
  "step_completed_at" jsonb DEFAULT '{}'::jsonb,
  "next_step_at" timestamp,
  "enrolled_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "campaign_enrollments_next_step_idx" ON "campaign_enrollments" USING btree ("next_step_at");
CREATE INDEX IF NOT EXISTS "campaign_enrollments_campaign_idx" ON "campaign_enrollments" USING btree ("campaign_sequence_id");
CREATE INDEX IF NOT EXISTS "campaign_enrollments_subject_idx" ON "campaign_enrollments" USING btree ("subject_id");
CREATE INDEX IF NOT EXISTS "campaign_enrollments_status_idx" ON "campaign_enrollments" USING btree ("status");

-- Unique enrollment per campaign + subject + recipient
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_enrollments_unique_idx"
  ON "campaign_enrollments" ("campaign_sequence_id", "subject_id", "recipient_hash");

--> statement-breakpoint

-- Seed the claim invite drip campaign
INSERT INTO "campaign_sequences" ("campaign_key", "name", "description", "steps") VALUES
(
  'claim_invite_drip',
  'Claim Invite Drip Campaign',
  'Follow-up sequence for unclaimed profile invites',
  '[
    {
      "stepNumber": 1,
      "delayHours": 72,
      "templateKey": "claim_invite_followup_1",
      "subject": "Reminder: Your profile is waiting",
      "skipConditions": [{"type": "opened", "stepNumber": "any"}],
      "stopConditions": [{"type": "claimed"}, {"type": "unsubscribed"}]
    },
    {
      "stepNumber": 2,
      "delayHours": 168,
      "templateKey": "claim_invite_followup_2",
      "subject": "Last chance to claim your profile",
      "skipConditions": [],
      "stopConditions": [{"type": "claimed"}, {"type": "unsubscribed"}, {"type": "bounced"}]
    },
    {
      "stepNumber": 3,
      "delayHours": 336,
      "templateKey": "claim_invite_followup_3",
      "subject": "Your profile will be removed soon",
      "skipConditions": [],
      "stopConditions": [{"type": "claimed"}, {"type": "unsubscribed"}, {"type": "bounced"}]
    }
  ]'::jsonb
)
ON CONFLICT ("campaign_key") DO NOTHING;
