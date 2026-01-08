ALTER TABLE "users" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "waitlist_entry_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "waitlist_approval";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."user_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."user_waitlist_approval";
