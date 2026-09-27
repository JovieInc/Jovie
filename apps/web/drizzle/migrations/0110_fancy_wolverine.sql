CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"institution_id" uuid,
	"provider_account_id" text,
	"name" text NOT NULL,
	"account_type" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"current_balance" numeric(19, 4),
	"available_balance" numeric(19, 4),
	"balance_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_item_id" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_transaction_id" text,
	"amount" numeric(19, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"merchant_name" text,
	"description" text,
	"category" text,
	"pending" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_institution_id_finance_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."finance_institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_exports" ADD CONSTRAINT "finance_exports_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_institutions" ADD CONSTRAINT "finance_institutions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_accounts_owner_idx" ON "finance_accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_accounts_institution_idx" ON "finance_accounts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_exports_owner_idx" ON "finance_exports" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_institutions_owner_idx" ON "finance_institutions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_institutions_provider_item_idx" ON "finance_institutions" USING btree ("provider","provider_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_owner_idx" ON "finance_transactions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_account_idx" ON "finance_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_occurred_idx" ON "finance_transactions" USING btree ("owner_user_id","occurred_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- JOV-4609: owner-only RLS for personal finance tables.
--
-- Deny-by-default: the ONLY way to reach a row is
--   owner_user_id = current_app_user_uuid()
-- (the authenticated user's users.id). Unlike the 0086 sensitive-tables
-- model there is deliberately NO system_* bypass and NO owner bridge:
-- background jobs and webhooks must run inside an owner-scoped session
-- (applyRlsSessionUser(ownerUserId)) and can never fan financial data into
-- shared creator records. Membership in any creator/workspace grants nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE "finance_institutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_institutions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_transactions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_exports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_institutions_owner_all"
  ON "finance_institutions"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_accounts_owner_all"
  ON "finance_accounts"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_transactions_owner_all"
  ON "finance_transactions"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_exports_owner_all"
  ON "finance_exports"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
