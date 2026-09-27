CREATE TABLE IF NOT EXISTS "ba_passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now(),
	"aaguid" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ba_passkeys" ADD CONSTRAINT "ba_passkeys_user_id_ba_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_passkeys_user_id" ON "ba_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ba_passkeys_credential_id" ON "ba_passkeys" USING btree ("credential_id");
