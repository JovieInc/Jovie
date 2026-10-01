CREATE TABLE "finance_budget_settings" (
	"owner_user_id" uuid PRIMARY KEY NOT NULL,
	"included_account_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_budget_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"month" text DEFAULT 'baseline' NOT NULL,
	"target_amount" numeric(19, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_budget_settings" ADD CONSTRAINT "finance_budget_settings_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_targets" ADD CONSTRAINT "finance_budget_targets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_budget_targets_owner_idx" ON "finance_budget_targets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_budget_targets_owner_category_month_idx" ON "finance_budget_targets" USING btree ("owner_user_id","category","month");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- JOV-4620: owner-only RLS for budget tables.
--
-- Same deny-by-default boundary as JOV-4609: the ONLY way to reach a row is
--   owner_user_id = current_app_user_uuid()
-- No system_* bypass and no owner bridge. Budgets, targets, variances, and
-- break-even inputs are private to the financial owner; creator/workspace
-- membership grants nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE "finance_budget_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_budget_targets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_budget_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_budget_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_budget_targets_owner_all"
  ON "finance_budget_targets"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_budget_settings_owner_all"
  ON "finance_budget_settings"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
