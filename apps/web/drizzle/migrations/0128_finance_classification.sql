CREATE TABLE "finance_classification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"match_account_id" uuid,
	"match_merchant_pattern" text,
	"match_direction" text,
	"match_amount_min" numeric(19, 4),
	"match_amount_max" numeric(19, 4),
	"match_description_tokens" jsonb,
	"match_recurrence" text,
	"set_lens" text NOT NULL,
	"set_category" text,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"source_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transaction_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"lens" text NOT NULL,
	"category" text,
	"confidence" numeric(5, 4) NOT NULL,
	"explanation" text NOT NULL,
	"source" text NOT NULL,
	"rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"lens" text NOT NULL,
	"category" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "default_lens" text;--> statement-breakpoint
ALTER TABLE "finance_classification_rules" ADD CONSTRAINT "finance_classification_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_classification_rules" ADD CONSTRAINT "finance_classification_rules_match_account_id_finance_accounts_id_fk" FOREIGN KEY ("match_account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_classification_rules" ADD CONSTRAINT "finance_classification_rules_source_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_classifications" ADD CONSTRAINT "finance_transaction_classifications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_classifications" ADD CONSTRAINT "finance_transaction_classifications_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_classifications" ADD CONSTRAINT "finance_transaction_classifications_rule_id_finance_classification_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."finance_classification_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_splits" ADD CONSTRAINT "finance_transaction_splits_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_splits" ADD CONSTRAINT "finance_transaction_splits_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_classification_rules_owner_idx" ON "finance_classification_rules" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transaction_classifications_tx_idx" ON "finance_transaction_classifications" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_classifications_owner_idx" ON "finance_transaction_classifications" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_splits_tx_idx" ON "finance_transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_splits_owner_idx" ON "finance_transaction_splits" USING btree ("owner_user_id");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- JOV-4615: owner-only RLS for finance classification tables.
--
-- Same deny-by-default model as JOV-4609: the ONLY way to reach a row is
--   owner_user_id = current_app_user_uuid()
-- No system_* bypass and no owner bridge. A `creator_*` lens value is a
-- classification label only — it never grants workspace or collaborator
-- access to the underlying row.
-- ---------------------------------------------------------------------------
ALTER TABLE "finance_classification_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_classification_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_transaction_classifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_transaction_classifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_transaction_splits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_transaction_splits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_classification_rules_owner_all"
  ON "finance_classification_rules"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_transaction_classifications_owner_all"
  ON "finance_transaction_classifications"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_transaction_splits_owner_all"
  ON "finance_transaction_splits"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
