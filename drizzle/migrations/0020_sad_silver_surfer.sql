ALTER TABLE "notification_subscriptions" ALTER COLUMN "channel" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."notification_channel";--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'push');--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ALTER COLUMN "channel" SET DATA TYPE "public"."notification_channel" USING "channel"::"public"."notification_channel";