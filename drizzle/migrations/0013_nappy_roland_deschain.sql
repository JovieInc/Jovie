ALTER TABLE "profile_photos" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profile_photos" ALTER COLUMN "status" SET DEFAULT 'uploading'::text;--> statement-breakpoint
DROP TYPE "public"."photo_status";--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "profile_photos" ALTER COLUMN "status" SET DEFAULT 'uploading'::"public"."photo_status";--> statement-breakpoint
ALTER TABLE "profile_photos" ALTER COLUMN "status" SET DATA TYPE "public"."photo_status" USING "status"::"public"."photo_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;