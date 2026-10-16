CREATE TABLE "royalty_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"connector_account_id" uuid NOT NULL,
	"import_key" text NOT NULL,
	"source_hash" text NOT NULL,
	"encrypted_evidence" text NOT NULL,
	"status" text DEFAULT 'persisted' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "royalty_sources_hash_check" CHECK ("royalty_sources"."source_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "royalty_sources_status_check" CHECK ("royalty_sources"."status" = 'persisted'),
	CONSTRAINT "royalty_sources_expiry_check" CHECK ("royalty_sources"."expires_at" > "royalty_sources"."created_at")
);
--> statement-breakpoint
ALTER TABLE "royalty_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "royalty_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"statement_version_id" uuid NOT NULL,
	"row_identity" text NOT NULL,
	"row_number" integer NOT NULL,
	"source_row_hash" text NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" numeric,
	"fx_currency" text,
	"fx_as_of" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "royalty_lines_row_check" CHECK ("royalty_statement_lines"."row_number" > 0),
	CONSTRAINT "royalty_lines_hash_check" CHECK ("royalty_statement_lines"."source_row_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "royalty_lines_amount_check" CHECK ("royalty_statement_lines"."amount"::text NOT IN ('NaN', 'Infinity', '-Infinity')),
	CONSTRAINT "royalty_lines_fx_check" CHECK ("royalty_statement_lines"."fx_rate" IS NULL OR ("royalty_statement_lines"."fx_rate" > 0 AND "royalty_statement_lines"."fx_rate"::text NOT IN ('NaN', 'Infinity')))
);
--> statement-breakpoint
ALTER TABLE "royalty_statement_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "royalty_statement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"statement_key" text NOT NULL,
	"version" integer NOT NULL,
	"parser_version" text NOT NULL,
	"status" text DEFAULT 'persisted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "royalty_versions_version_check" CHECK ("royalty_statement_versions"."version" > 0),
	CONSTRAINT "royalty_versions_status_check" CHECK ("royalty_statement_versions"."status" = 'persisted')
);
--> statement-breakpoint
ALTER TABLE "royalty_statement_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_sources_owner_id_unique" ON "royalty_sources" USING btree ("owner_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_sources_import_unique" ON "royalty_sources" USING btree ("owner_user_id","connector_account_id","import_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "royalty_sources_hash_idx" ON "royalty_sources" USING btree ("owner_user_id","source_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "royalty_sources_retention_idx" ON "royalty_sources" USING btree ("owner_user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_lines_identity_unique" ON "royalty_statement_lines" USING btree ("owner_user_id","statement_version_id","row_identity");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_lines_position_unique" ON "royalty_statement_lines" USING btree ("owner_user_id","statement_version_id","row_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_versions_owner_id_unique" ON "royalty_statement_versions" USING btree ("owner_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_versions_identity_unique" ON "royalty_statement_versions" USING btree ("owner_user_id","statement_key","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "royalty_versions_source_idx" ON "royalty_statement_versions" USING btree ("owner_user_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_accounts_user_id_unique" ON "connector_accounts" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "royalty_sources" ADD CONSTRAINT "royalty_sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_sources" ADD CONSTRAINT "royalty_sources_connector_owner_fk" FOREIGN KEY ("owner_user_id","connector_account_id") REFERENCES "public"."connector_accounts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_statement_lines" ADD CONSTRAINT "royalty_statement_lines_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_statement_lines" ADD CONSTRAINT "royalty_lines_version_owner_fk" FOREIGN KEY ("owner_user_id","statement_version_id") REFERENCES "public"."royalty_statement_versions"("owner_user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_statement_versions" ADD CONSTRAINT "royalty_statement_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_statement_versions" ADD CONSTRAINT "royalty_versions_source_owner_fk" FOREIGN KEY ("owner_user_id","source_id") REFERENCES "public"."royalty_sources"("owner_user_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- JOV-8431: no creator, collaborator, table-owner, or system-session bridge.
ALTER TABLE royalty_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE royalty_statement_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE royalty_statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY royalty_sources_owner ON royalty_sources FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
CREATE POLICY royalty_versions_owner ON royalty_statement_versions FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
CREATE POLICY royalty_lines_owner ON royalty_statement_lines FOR ALL
  USING (owner_user_id = current_app_user_uuid())
  WITH CHECK (owner_user_id = current_app_user_uuid());
--> statement-breakpoint
-- Users still has legacy clerk-only RLS for non-owner database roles. These
-- narrow definer helpers expose only active status and lock the session owner;
-- they never expose user data or bypass RLS on royalty evidence.
CREATE FUNCTION royalty_owner_active(owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = owner_id AND deleted_at IS NULL);
$$;
CREATE FUNCTION lock_active_royalty_owner() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM users WHERE id = current_app_user_uuid() AND deleted_at IS NULL FOR SHARE;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
-- Source erasure is the sole explicit deletion root; child history is immutable.
CREATE FUNCTION guard_royalty_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR (TG_OP = 'DELETE' AND pg_trigger_depth() = 1
    AND royalty_owner_active(OLD.owner_user_id)) THEN
    RAISE EXCEPTION 'royalty history is immutable';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER royalty_source_immutable BEFORE UPDATE ON royalty_sources
  FOR EACH ROW EXECUTE FUNCTION guard_royalty_history();
CREATE TRIGGER royalty_version_immutable BEFORE UPDATE OR DELETE ON royalty_statement_versions
  FOR EACH ROW EXECUTE FUNCTION guard_royalty_history();
CREATE TRIGGER royalty_line_immutable BEFORE UPDATE OR DELETE ON royalty_statement_lines
  FOR EACH ROW EXECUTE FUNCTION guard_royalty_history();
--> statement-breakpoint
-- A committed version cannot accept extra lines in a later transaction.
CREATE FUNCTION guard_royalty_line_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM royalty_statement_versions v
    WHERE v.id = NEW.statement_version_id AND v.owner_user_id = NEW.owner_user_id
      AND v.xmin::text = (pg_current_xact_id()::text::numeric % 4294967296)::text
  ) THEN RAISE EXCEPTION 'royalty version is sealed'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER royalty_line_sealed BEFORE INSERT ON royalty_statement_lines
  FOR EACH ROW EXECUTE FUNCTION guard_royalty_line_insert();
--> statement-breakpoint
-- Audit writes are part of the same statement/transaction, including direct SQL.
-- Only canonical IDs, hashes and version numbers enter finance_ledger_events.
CREATE FUNCTION audit_royalty_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source royalty_sources;
BEGIN
  IF TG_OP = 'DELETE' THEN source := OLD; ELSE source := NEW; END IF;
  IF royalty_owner_active(source.owner_user_id) THEN
    INSERT INTO finance_ledger_events (owner_user_id, entity_kind, entity_id, event_kind, payload)
    VALUES (source.owner_user_id, 'royalty_source', source.id::text,
      CASE WHEN TG_OP = 'DELETE' THEN 'royalty_source_deleted' ELSE 'royalty_source_persisted' END,
      jsonb_build_object('sourceHash', source.source_hash));
  END IF;
  RETURN source;
END;
$$;
CREATE TRIGGER royalty_source_audit AFTER INSERT OR DELETE ON royalty_sources
  FOR EACH ROW EXECUTE FUNCTION audit_royalty_source();
CREATE FUNCTION audit_royalty_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO finance_ledger_events (owner_user_id, entity_kind, entity_id, event_kind, payload)
  VALUES (NEW.owner_user_id, 'royalty_statement_version', NEW.id::text, 'royalty_statement_persisted',
    jsonb_build_object('sourceId', NEW.source_id, 'version', NEW.version));
  RETURN NEW;
END;
$$;
CREATE TRIGGER royalty_version_audit AFTER INSERT ON royalty_statement_versions
  FOR EACH ROW EXECUTE FUNCTION audit_royalty_version();
--> statement-breakpoint
CREATE FUNCTION guard_royalty_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.entity_kind IN ('royalty_source', 'royalty_statement_version') THEN
    IF TG_OP = 'UPDATE' OR royalty_owner_active(OLD.owner_user_id) THEN
      RAISE EXCEPTION 'royalty audit is immutable';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.entity_kind IN ('royalty_source', 'royalty_statement_version') THEN
      RAISE EXCEPTION 'royalty audit is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER royalty_audit_immutable BEFORE UPDATE OR DELETE ON finance_ledger_events
  FOR EACH ROW EXECUTE FUNCTION guard_royalty_audit();
--> statement-breakpoint
-- The account deletion route fences users via deleted_at before erasing data.
-- This covers both that soft deletion and hard deletion via the generated FKs.
CREATE FUNCTION erase_owner_royalties() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM royalty_sources WHERE owner_user_id = NEW.id;
    DELETE FROM finance_ledger_events WHERE owner_user_id = NEW.id
      AND entity_kind IN ('royalty_source', 'royalty_statement_version');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_erase_royalties AFTER UPDATE OF deleted_at ON users
  FOR EACH ROW EXECUTE FUNCTION erase_owner_royalties();
