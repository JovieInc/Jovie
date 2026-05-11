-- JOV-2132 PR 1: enable anonymous onboarding conversations.
-- Make user/profile FK columns nullable, add session_id with a partial unique
-- index so a sessionId can only be claimed onto exactly one user, and add a
-- check constraint enforcing that every row has at least one identifier.

ALTER TABLE "chat_conversations" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ALTER COLUMN "creator_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "session_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_session_id" ON "chat_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_conversations_session_id_claimed_unique" ON "chat_conversations" USING btree ("session_id") WHERE "chat_conversations"."user_id" IS NOT NULL AND "chat_conversations"."session_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_identity_check" CHECK ("chat_conversations"."user_id" IS NOT NULL OR "chat_conversations"."session_id" IS NOT NULL);
