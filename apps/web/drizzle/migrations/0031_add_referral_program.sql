-- Referral Program Tables
-- Adds referral codes, referrals tracking, and commission ledger

-- Create referral status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
    CREATE TYPE "public"."referral_status" AS ENUM('pending', 'active', 'churned', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_commission_status') THEN
    CREATE TYPE "public"."referral_commission_status" AS ENUM('pending', 'approved', 'paid', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_codes_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"commission_rate_bps" integer DEFAULT 5000 NOT NULL,
	"commission_duration_months" integer DEFAULT 24 NOT NULL,
	"subscribed_at" timestamp,
	"expires_at" timestamp,
	"churned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "referral_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "referral_commission_status" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_commissions_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by_code" text;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referrer_user_id_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referred_user_id_idx" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_referral_id_idx" ON "referral_commissions" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_referrer_user_id_idx" ON "referral_commissions" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_status_idx" ON "referral_commissions" USING btree ("status");
