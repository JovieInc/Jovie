CREATE TABLE IF NOT EXISTS "price_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"price_version_id" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"monthly_amount_cents" integer,
	"yearly_amount_cents" integer,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"source" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"reconcile_status" text,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_locks_amounts_check" CHECK (("price_locks"."monthly_amount_cents" IS NOT NULL OR "price_locks"."yearly_amount_cents" IS NOT NULL) AND ("price_locks"."monthly_amount_cents" IS NULL OR "price_locks"."monthly_amount_cents" > 0) AND ("price_locks"."yearly_amount_cents" IS NULL OR "price_locks"."yearly_amount_cents" > 0))
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "price_locks" ADD CONSTRAINT "price_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_locks_user_id_unique" ON "price_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_locks_price_version_idx" ON "price_locks" USING btree ("price_version_id");