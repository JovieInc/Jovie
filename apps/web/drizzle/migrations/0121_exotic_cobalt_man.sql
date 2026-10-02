CREATE TABLE "ios_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"environment" text NOT NULL,
	"last_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ios_push_devices_environment_valid" CHECK ("ios_push_devices"."environment" IN ('sandbox', 'production'))
);
--> statement-breakpoint
ALTER TABLE "ios_push_devices" ADD CONSTRAINT "ios_push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ios_push_devices_token_hash_unique" ON "ios_push_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ios_push_devices_active_user_idx" ON "ios_push_devices" USING btree ("user_id") WHERE "ios_push_devices"."disabled_at" IS NULL;
