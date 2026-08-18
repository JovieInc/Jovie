DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_claim_evidence_state') THEN
    CREATE TYPE "public"."creator_claim_evidence_state" AS ENUM('supported', 'contested', 'unresolved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_claim_kind') THEN
    CREATE TYPE "public"."creator_claim_kind" AS ENUM('fact', 'inference', 'opinion', 'anecdote');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_document_kind') THEN
    CREATE TYPE "public"."creator_document_kind" AS ENUM('idea', 'research', 'script');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_document_stage') THEN
    CREATE TYPE "public"."creator_document_stage" AS ENUM('private_draft', 'evidence_review', 'creator_approved', 'capture_ready');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "creator_capture_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"kind" "creator_document_kind" NOT NULL,
	"content" jsonb NOT NULL,
	"plain_text" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_document_revisions_positive_revision" CHECK ("creator_document_revisions"."revision" > 0 AND "creator_document_revisions"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "creator_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "creator_document_kind" DEFAULT 'idea' NOT NULL,
	"stage" "creator_document_stage" DEFAULT 'private_draft' NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"capture_idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_documents_positive_revision" CHECK ("creator_documents"."current_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "creator_revision_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"approved_by_user_id" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "creator_revision_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"claim_text" text NOT NULL,
	"kind" "creator_claim_kind" NOT NULL,
	"evidence_state" "creator_claim_evidence_state" DEFAULT 'unresolved' NOT NULL,
	"source_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_revision_claims_supported_have_evidence" CHECK ("creator_revision_claims"."evidence_state" <> 'supported' OR "creator_revision_claims"."source_record_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "creator_capture_handoffs" ADD CONSTRAINT "creator_capture_handoffs_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_capture_handoffs" ADD CONSTRAINT "creator_capture_handoffs_document_id_creator_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."creator_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_capture_handoffs" ADD CONSTRAINT "creator_capture_handoffs_revision_id_creator_document_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."creator_document_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_capture_handoffs" ADD CONSTRAINT "creator_capture_handoffs_approval_id_creator_revision_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."creator_revision_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_document_revisions" ADD CONSTRAINT "creator_document_revisions_document_id_creator_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."creator_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_documents" ADD CONSTRAINT "creator_documents_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_revision_approvals" ADD CONSTRAINT "creator_revision_approvals_document_id_creator_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."creator_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_revision_approvals" ADD CONSTRAINT "creator_revision_approvals_revision_id_creator_document_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."creator_document_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_revision_claims" ADD CONSTRAINT "creator_revision_claims_revision_id_creator_document_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."creator_document_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_revision_claims" ADD CONSTRAINT "creator_revision_claims_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_capture_handoffs_approval_unique" ON "creator_capture_handoffs" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_capture_handoffs_profile_created_idx" ON "creator_capture_handoffs" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_document_revisions_document_revision_unique" ON "creator_document_revisions" USING btree ("document_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_document_revisions_content_hash_idx" ON "creator_document_revisions" USING btree ("document_id","content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_documents_profile_updated_idx" ON "creator_documents" USING btree ("creator_profile_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_documents_capture_idempotency_unique" ON "creator_documents" USING btree ("creator_profile_id","capture_idempotency_key") WHERE capture_idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_revision_approvals_exact_revision_unique" ON "creator_revision_approvals" USING btree ("document_id","revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_revision_claims_revision_idx" ON "creator_revision_claims" USING btree ("revision_id");
--> statement-breakpoint

-- Private creator documents are never public-readable. FORCE protects the
-- table owner path; the explicit owner bridge preserves existing server
-- callers while API authorization is migrated to session-bound transactions.
ALTER TABLE "creator_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_document_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_document_revisions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_revision_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_revision_claims" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_revision_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_revision_approvals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_capture_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_capture_handoffs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION can_manage_private_creator_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM creator_profiles cp
    WHERE cp.id = p_profile_id
      AND (
        EXISTS (
          SELECT 1 FROM user_profile_claims upc
          WHERE upc.creator_profile_id = cp.id
            AND upc.user_id = current_app_user_uuid()
            AND upc.role IN ('owner', 'manager')
        )
      )
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION owns_private_creator_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM creator_profiles cp
    WHERE cp.id = p_profile_id
      AND (
        EXISTS (
          SELECT 1 FROM user_profile_claims upc
          WHERE upc.creator_profile_id = cp.id
            AND upc.user_id = current_app_user_uuid()
            AND upc.role = 'owner'
        )
      )
  );
$$;
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_documents_private_access" ON "creator_documents";
DROP POLICY IF EXISTS "creator_documents_system_all" ON "creator_documents";
DROP POLICY IF EXISTS "creator_documents_owner_bridge" ON "creator_documents";
CREATE POLICY "creator_documents_private_access" ON "creator_documents" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "creator_documents_system_all" ON "creator_documents" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_documents_owner_bridge" ON "creator_documents" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_documents'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_documents'));
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_document_revisions_private_access" ON "creator_document_revisions";
DROP POLICY IF EXISTS "creator_document_revisions_system_all" ON "creator_document_revisions";
DROP POLICY IF EXISTS "creator_document_revisions_owner_bridge" ON "creator_document_revisions";
CREATE POLICY "creator_document_revisions_private_access" ON "creator_document_revisions" FOR ALL
  USING (EXISTS (SELECT 1 FROM creator_documents d WHERE d.id = document_id AND can_manage_private_creator_profile(d.creator_profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM creator_documents d WHERE d.id = document_id AND can_manage_private_creator_profile(d.creator_profile_id)));
CREATE POLICY "creator_document_revisions_system_all" ON "creator_document_revisions" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_document_revisions_owner_bridge" ON "creator_document_revisions" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_document_revisions'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_document_revisions'));
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_revision_claims_private_access" ON "creator_revision_claims";
DROP POLICY IF EXISTS "creator_revision_claims_system_all" ON "creator_revision_claims";
DROP POLICY IF EXISTS "creator_revision_claims_owner_bridge" ON "creator_revision_claims";
CREATE POLICY "creator_revision_claims_private_access" ON "creator_revision_claims" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM creator_document_revisions r
    JOIN creator_documents d ON d.id = r.document_id
    WHERE r.id = revision_id AND can_manage_private_creator_profile(d.creator_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM creator_document_revisions r
    JOIN creator_documents d ON d.id = r.document_id
    WHERE r.id = revision_id AND can_manage_private_creator_profile(d.creator_profile_id)
  ));
CREATE POLICY "creator_revision_claims_system_all" ON "creator_revision_claims" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_revision_claims_owner_bridge" ON "creator_revision_claims" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_revision_claims'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_revision_claims'));
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_revision_approvals_private_select" ON "creator_revision_approvals";
DROP POLICY IF EXISTS "creator_revision_approvals_owner_write" ON "creator_revision_approvals";
DROP POLICY IF EXISTS "creator_revision_approvals_system_all" ON "creator_revision_approvals";
DROP POLICY IF EXISTS "creator_revision_approvals_owner_bridge" ON "creator_revision_approvals";
CREATE POLICY "creator_revision_approvals_private_select" ON "creator_revision_approvals" FOR SELECT
  USING (EXISTS (SELECT 1 FROM creator_documents d WHERE d.id = document_id AND can_manage_private_creator_profile(d.creator_profile_id)));
CREATE POLICY "creator_revision_approvals_owner_write" ON "creator_revision_approvals" FOR ALL
  USING (EXISTS (SELECT 1 FROM creator_documents d WHERE d.id = document_id AND owns_private_creator_profile(d.creator_profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM creator_documents d WHERE d.id = document_id AND owns_private_creator_profile(d.creator_profile_id)));
CREATE POLICY "creator_revision_approvals_system_all" ON "creator_revision_approvals" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_revision_approvals_owner_bridge" ON "creator_revision_approvals" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_revision_approvals'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_revision_approvals'));
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_capture_handoffs_private_select" ON "creator_capture_handoffs";
DROP POLICY IF EXISTS "creator_capture_handoffs_owner_write" ON "creator_capture_handoffs";
DROP POLICY IF EXISTS "creator_capture_handoffs_system_all" ON "creator_capture_handoffs";
DROP POLICY IF EXISTS "creator_capture_handoffs_owner_bridge" ON "creator_capture_handoffs";
CREATE POLICY "creator_capture_handoffs_private_select" ON "creator_capture_handoffs" FOR SELECT
  USING (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "creator_capture_handoffs_owner_write" ON "creator_capture_handoffs" FOR ALL
  USING (owns_private_creator_profile(creator_profile_id))
  WITH CHECK (owns_private_creator_profile(creator_profile_id));
CREATE POLICY "creator_capture_handoffs_system_all" ON "creator_capture_handoffs" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_capture_handoffs_owner_bridge" ON "creator_capture_handoffs" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_capture_handoffs'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_capture_handoffs'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_creator_claim_ledger_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision_id uuid := COALESCE(NEW.revision_id, OLD.revision_id);
  v_stage creator_document_stage;
BEGIN
  SELECT d.stage INTO v_stage
    FROM creator_document_revisions r
    JOIN creator_documents d ON d.id = r.document_id
    WHERE r.id = v_revision_id
    FOR UPDATE OF d;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_stage IS DISTINCT FROM 'private_draft' THEN
    RAISE EXCEPTION 'creator claim ledger is frozen';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS creator_claim_ledger_open_guard ON creator_revision_claims;
CREATE TRIGGER creator_claim_ledger_open_guard
  BEFORE INSERT OR UPDATE OR DELETE ON creator_revision_claims
  FOR EACH ROW EXECUTE FUNCTION enforce_creator_claim_ledger_open();
--> statement-breakpoint

-- Lock and inspect in separate PL/pgSQL commands so READ COMMITTED takes a
-- fresh snapshot after any in-flight claim insertion releases the row lock.
CREATE OR REPLACE FUNCTION complete_creator_evidence_review(
  p_creator_profile_id uuid,
  p_document_id uuid,
  p_revision integer
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_revision integer;
  v_stage creator_document_stage;
  v_kind creator_document_kind;
BEGIN
  SELECT current_revision, stage, kind
    INTO v_current_revision, v_stage, v_kind
    FROM creator_documents
    WHERE id = p_document_id
      AND creator_profile_id = p_creator_profile_id
    FOR UPDATE;

  IF NOT FOUND
    OR v_current_revision IS DISTINCT FROM p_revision
    OR v_stage IS DISTINCT FROM 'private_draft'
    OR v_kind IS DISTINCT FROM 'script'
  THEN
    RETURN 'revision_conflict';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM creator_document_revisions revision
    JOIN creator_revision_claims claim ON claim.revision_id = revision.id
    WHERE revision.document_id = p_document_id
      AND revision.revision = p_revision
      AND claim.kind = 'fact'
      AND (claim.evidence_state <> 'supported' OR claim.source_record_id IS NULL)
  ) THEN
    RETURN 'evidence_incomplete';
  END IF;

  UPDATE creator_documents
    SET stage = 'evidence_review', updated_at = now()
    WHERE id = p_document_id;
  RETURN 'updated';
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_creator_approval_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM creator_document_revisions r
    WHERE r.id = NEW.revision_id AND r.document_id = NEW.document_id
  ) THEN
    RAISE EXCEPTION 'creator approval revision does not belong to document';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS creator_approval_integrity_guard ON creator_revision_approvals;
CREATE TRIGGER creator_approval_integrity_guard
  BEFORE INSERT OR UPDATE ON creator_revision_approvals
  FOR EACH ROW EXECUTE FUNCTION enforce_creator_approval_integrity();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_creator_handoff_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
    FROM creator_documents d
    JOIN creator_document_revisions r ON r.document_id = d.id
    JOIN creator_revision_approvals a ON a.document_id = d.id AND a.revision_id = r.id
    WHERE d.id = NEW.document_id
      AND d.creator_profile_id = NEW.creator_profile_id
      AND r.id = NEW.revision_id
      AND a.id = NEW.approval_id
      AND a.revoked_at IS NULL
    FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator capture handoff tuple is inconsistent';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS creator_handoff_integrity_guard ON creator_capture_handoffs;
CREATE TRIGGER creator_handoff_integrity_guard
  BEFORE INSERT OR UPDATE ON creator_capture_handoffs
  FOR EACH ROW EXECUTE FUNCTION enforce_creator_handoff_integrity();
