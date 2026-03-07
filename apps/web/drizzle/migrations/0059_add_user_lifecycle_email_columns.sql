ALTER TABLE "users" ADD COLUMN "founder_welcome_sent_at" timestamp;
ALTER TABLE "users" ADD COLUMN "welcome_failed_at" timestamp;
ALTER TABLE "users" ADD COLUMN "outbound_suppressed_at" timestamp;
ALTER TABLE "users" ADD COLUMN "suppression_failed_at" timestamp;
