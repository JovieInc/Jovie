ALTER TABLE "notification_subscriptions"
ADD COLUMN "email_otp_hash" text,
ADD COLUMN "email_otp_expires_at" timestamp,
ADD COLUMN "email_otp_last_sent_at" timestamp,
ADD COLUMN "email_otp_attempts" integer DEFAULT 0 NOT NULL;
