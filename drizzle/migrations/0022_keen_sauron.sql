CREATE TYPE "public"."waitlist_invite_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "waitlist_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"claim_token" text NOT NULL,
	"status" "waitlist_invite_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_waitlist_invites_entry_id" ON "waitlist_invites" USING btree ("waitlist_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_subscriptions_creator_profile_id_email_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_subscriptions_creator_profile_id_phone_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","phone");