CREATE TABLE "finance_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"account_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" text NOT NULL,
	"source" text NOT NULL,
	"balance" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_ledger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_kind" text NOT NULL,
	"payload" jsonb,
	"sync_request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_request_id" text,
	"last_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "status" text DEFAULT 'posted' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "flow_kind" text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "matched_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "superseded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_anomalies" ADD CONSTRAINT "finance_anomalies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_anomalies" ADD CONSTRAINT "finance_anomalies_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_balance_snapshots" ADD CONSTRAINT "finance_balance_snapshots_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_balance_snapshots" ADD CONSTRAINT "finance_balance_snapshots_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_ledger_events" ADD CONSTRAINT "finance_ledger_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_sync_states" ADD CONSTRAINT "finance_sync_states_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_sync_states" ADD CONSTRAINT "finance_sync_states_institution_id_finance_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."finance_institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_anomalies_owner_idx" ON "finance_anomalies" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_anomalies_account_idx" ON "finance_anomalies" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_balance_snapshots_owner_idx" ON "finance_balance_snapshots" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_balance_snapshots_account_date_unique" ON "finance_balance_snapshots" USING btree ("account_id","snapshot_date","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_ledger_events_owner_idx" ON "finance_ledger_events" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_ledger_events_entity_idx" ON "finance_ledger_events" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_sync_states_owner_idx" ON "finance_sync_states" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_sync_states_institution_unique" ON "finance_sync_states" USING btree ("owner_user_id","institution_id");--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_matched_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_superseded_by_id_finance_transactions_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_accounts_provider_account_unique" ON "finance_accounts" USING btree ("owner_user_id","institution_id","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_dedupe_unique" ON "finance_transactions" USING btree ("owner_user_id","account_id","dedupe_key");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- JOV-4612: owner-only RLS for ledger/sync tables — same deny-by-default
-- boundary as JOV-4609. No system bypass, no owner bridge; sync jobs must
-- run inside an owner-scoped session (applyRlsSessionUser(ownerUserId)).
-- ---------------------------------------------------------------------------
ALTER TABLE "finance_sync_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_sync_states" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_balance_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_balance_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_ledger_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_ledger_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "finance_anomalies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_anomalies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_sync_states_owner_all"
  ON "finance_sync_states"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_balance_snapshots_owner_all"
  ON "finance_balance_snapshots"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_ledger_events_owner_all"
  ON "finance_ledger_events"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY "finance_anomalies_owner_all"
  ON "finance_anomalies"
  FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
