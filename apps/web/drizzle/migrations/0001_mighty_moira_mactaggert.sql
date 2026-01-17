DROP INDEX "audience_members_creator_profile_id_fingerprint_unique";--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "suno_id" text;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "udio_id" text;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_contact_required" CHECK ("notification_subscriptions"."email" IS NOT NULL OR "notification_subscriptions"."phone" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" VALIDATE CONSTRAINT "notification_subscriptions_contact_required";