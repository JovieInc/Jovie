CREATE TABLE "connector_write_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"connector_account_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"rate_key" text,
	"receipt" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_write_receipts_phase_uniq" ON "connector_write_receipts" USING btree ("proposal_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_write_receipts_rate_uniq" ON "connector_write_receipts" USING btree ("rate_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_write_receipts_user_account_idx" ON "connector_write_receipts" USING btree ("user_id","connector_account_id","recorded_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_connector_write_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'connector write receipts are append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER connector_write_receipts_immutable
  BEFORE UPDATE OR DELETE ON connector_write_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_connector_write_receipt_mutation();
--> statement-breakpoint
CREATE TRIGGER connector_write_receipts_no_truncate
  BEFORE TRUNCATE ON connector_write_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_connector_write_receipt_mutation();
--> statement-breakpoint
ALTER TABLE connector_write_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_write_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY connector_write_receipts_read ON connector_write_receipts
  FOR SELECT USING (user_id = current_app_user_uuid());
--> statement-breakpoint
CREATE POLICY connector_write_receipts_append ON connector_write_receipts
  FOR INSERT WITH CHECK (user_id = current_app_user_uuid());
