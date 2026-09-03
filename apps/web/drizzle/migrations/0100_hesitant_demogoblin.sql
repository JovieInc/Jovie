CREATE TABLE "investor_stakeholder_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_label" text NOT NULL,
	"role" text NOT NULL,
	"contribution_knowledge" text DEFAULT 'unknown' NOT NULL,
	"contribution_amount_cents" integer,
	"contribution_currency" text,
	"contribution_source_record_id" uuid,
	"contribution_as_of" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_stakeholder_records_role_valid" CHECK ("investor_stakeholder_records"."role" in ('investor', 'advisor', 'contributor', 'founder_self')),
	CONSTRAINT "investor_stakeholder_records_knowledge_valid" CHECK ("investor_stakeholder_records"."contribution_knowledge" in ('known', 'estimated', 'unknown')),
	CONSTRAINT "investor_stakeholder_records_contribution_valid" CHECK (("investor_stakeholder_records"."contribution_knowledge" = 'unknown' and "investor_stakeholder_records"."contribution_amount_cents" is null and "investor_stakeholder_records"."contribution_currency" is null and "investor_stakeholder_records"."contribution_source_record_id" is null and "investor_stakeholder_records"."contribution_as_of" is null) or ("investor_stakeholder_records"."contribution_knowledge" in ('known', 'estimated') and "investor_stakeholder_records"."contribution_amount_cents" >= 0 and "investor_stakeholder_records"."contribution_currency" ~ '^[A-Z]{3}$' and "investor_stakeholder_records"."contribution_source_record_id" is not null and "investor_stakeholder_records"."contribution_as_of" is not null))
);
--> statement-breakpoint
CREATE TABLE "investor_update_candidate_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"edited_claim" text,
	"decided_by_user_id" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_update_candidate_decisions_valid" CHECK ("investor_update_candidate_decisions"."decision" in ('share', 'exclude', 'edit')),
	CONSTRAINT "investor_update_candidate_decisions_edit_copy_valid" CHECK (("investor_update_candidate_decisions"."decision" = 'edit' and nullif(trim("investor_update_candidate_decisions"."edited_claim"), '') is not null) or ("investor_update_candidate_decisions"."decision" <> 'edit' and "investor_update_candidate_decisions"."edited_claim" is null))
);
--> statement-breakpoint
CREATE TABLE "investor_update_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"metric_label" text NOT NULL,
	"metric_value" text NOT NULL,
	"metric_unit" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"source_record_id" uuid NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"source_observed_at" timestamp with time zone NOT NULL,
	"confidence" real NOT NULL,
	"caveats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_claim" text NOT NULL,
	"relevance_score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_update_candidates_kind_valid" CHECK ("investor_update_candidates"."kind" in ('win', 'ask')),
	CONSTRAINT "investor_update_candidates_confidence_range" CHECK ("investor_update_candidates"."confidence" between 0 and 1),
	CONSTRAINT "investor_update_candidates_relevance_range" CHECK ("investor_update_candidates"."relevance_score" between 0 and 1),
	CONSTRAINT "investor_update_candidates_metric_window_valid" CHECK ("investor_update_candidates"."window_end" >= "investor_update_candidates"."window_start")
);
--> statement-breakpoint
CREATE TABLE "investor_update_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"external_reference" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_update_delivery_events_type_valid" CHECK ("investor_update_delivery_events"."event_type" in ('provider_accepted', 'delivered', 'bounced', 'failed')),
	CONSTRAINT "investor_update_delivery_events_recipient_count_valid" CHECK ("investor_update_delivery_events"."recipient_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "investor_update_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"subject" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_update_drafts_period_month_start" CHECK ("investor_update_drafts"."period_start" = date_trunc('month', "investor_update_drafts"."period_start")::date)
);
--> statement-breakpoint
CREATE TABLE "investor_update_final_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"rendered_copy" text NOT NULL,
	"copy_hash" text NOT NULL,
	"snapshot_fingerprint" text NOT NULL,
	"decision_record_ids" jsonb NOT NULL,
	"recipient_segments" jsonb NOT NULL,
	"recipient_count" integer NOT NULL,
	"tracking_settings" jsonb DEFAULT '{"opens":false,"clicks":false,"privacyDisclosureVersion":null,"consentBasis":null}'::jsonb NOT NULL,
	"approved_by_user_id" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "investor_update_final_approvals_recipient_count_valid" CHECK ("investor_update_final_approvals"."recipient_count" > 0),
	CONSTRAINT "investor_update_final_approvals_window_valid" CHECK ("investor_update_final_approvals"."expires_at" > "investor_update_final_approvals"."approved_at"),
	CONSTRAINT "investor_update_final_approvals_tracking_disabled" CHECK (coalesce(("investor_update_final_approvals"."tracking_settings" ->> 'opens')::boolean, false) = false and coalesce(("investor_update_final_approvals"."tracking_settings" ->> 'clicks')::boolean, false) = false)
);
--> statement-breakpoint
ALTER TABLE "investor_stakeholder_records" ADD CONSTRAINT "investor_stakeholder_records_contribution_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("contribution_source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_update_candidate_decisions" ADD CONSTRAINT "investor_update_candidate_decisions_candidate_id_investor_update_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."investor_update_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_update_candidates" ADD CONSTRAINT "investor_update_candidates_draft_id_investor_update_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."investor_update_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_update_candidates" ADD CONSTRAINT "investor_update_candidates_source_record_id_memory_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."memory_source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_update_delivery_events" ADD CONSTRAINT "investor_update_delivery_events_approval_id_investor_update_final_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."investor_update_final_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_update_final_approvals" ADD CONSTRAINT "investor_update_final_approvals_draft_id_investor_update_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."investor_update_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_stakeholder_records_role_idx" ON "investor_stakeholder_records" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_stakeholder_records_source_idx" ON "investor_stakeholder_records" USING btree ("contribution_source_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_update_candidate_decisions_candidate_time_idx" ON "investor_update_candidate_decisions" USING btree ("candidate_id","decided_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_update_candidates_draft_rank_idx" ON "investor_update_candidates" USING btree ("draft_id","relevance_score","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_update_candidates_source_idx" ON "investor_update_candidates" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_update_delivery_events_approval_idx" ON "investor_update_delivery_events" USING btree ("approval_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investor_update_delivery_events_external_unique" ON "investor_update_delivery_events" USING btree ("approval_id","event_type","external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investor_update_drafts_period_unique" ON "investor_update_drafts" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_update_final_approvals_draft_time_idx" ON "investor_update_final_approvals" USING btree ("draft_id","approved_at","id");--> statement-breakpoint
ALTER TABLE "investor_update_drafts" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "investor_update_final_approvals" ADD COLUMN "draft_revision" integer NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "investor_update_advance_draft_revision"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	target_draft_id uuid;
BEGIN
	IF TG_TABLE_NAME = 'investor_update_candidates' THEN
		target_draft_id := NEW.draft_id;
	ELSE
		SELECT draft_id INTO target_draft_id
		FROM investor_update_candidates
		WHERE id = NEW.candidate_id;
	END IF;

	UPDATE investor_update_drafts
	SET revision = revision + 1, updated_at = now()
	WHERE id = target_draft_id;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "investor_update_version_subject_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.subject IS DISTINCT FROM OLD.subject AND NEW.revision = OLD.revision THEN
		NEW.revision := OLD.revision + 1;
	END IF;
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "investor_update_prevent_ledger_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'investor_update_append_only_violation' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "investor_update_validate_approval_snapshot"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	current_revision integer;
	provided_count integer;
	provided_distinct_count integer;
	latest_count integer;
	candidate_count integer;
BEGIN
	SELECT revision INTO current_revision
	FROM investor_update_drafts
	WHERE id = NEW.draft_id
	FOR UPDATE;

	IF current_revision IS NULL OR current_revision <> NEW.draft_revision THEN
		RAISE EXCEPTION 'investor_update_revision_conflict' USING ERRCODE = '40001';
	END IF;

	IF jsonb_typeof(NEW.decision_record_ids) <> 'array' THEN
		RAISE EXCEPTION 'investor_update_decision_snapshot_invalid' USING ERRCODE = '23514';
	END IF;

	SELECT count(*), count(DISTINCT decision_id)
	INTO provided_count, provided_distinct_count
	FROM jsonb_array_elements_text(NEW.decision_record_ids) AS ids(decision_id);

	IF provided_count <> provided_distinct_count OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements_text(NEW.decision_record_ids) AS ids(decision_id)
		LEFT JOIN investor_update_candidate_decisions decision
			ON decision.id::text = ids.decision_id
		LEFT JOIN investor_update_candidates candidate
			ON candidate.id = decision.candidate_id
		WHERE decision.id IS NULL OR candidate.draft_id <> NEW.draft_id
	) THEN
		RAISE EXCEPTION 'investor_update_decision_snapshot_invalid' USING ERRCODE = '23514';
	END IF;

	WITH latest_decisions AS (
		SELECT DISTINCT ON (decision.candidate_id) decision.id
		FROM investor_update_candidate_decisions decision
		JOIN investor_update_candidates candidate
			ON candidate.id = decision.candidate_id
		WHERE candidate.draft_id = NEW.draft_id
		ORDER BY decision.candidate_id, decision.decided_at DESC, decision.id DESC
	)
	SELECT count(*) INTO latest_count FROM latest_decisions;
	SELECT count(*) INTO candidate_count
	FROM investor_update_candidates
	WHERE draft_id = NEW.draft_id;

	IF candidate_count <> latest_count OR latest_count <> provided_count OR EXISTS (
		WITH latest_decisions AS (
			SELECT DISTINCT ON (decision.candidate_id) decision.id
			FROM investor_update_candidate_decisions decision
			JOIN investor_update_candidates candidate
				ON candidate.id = decision.candidate_id
			WHERE candidate.draft_id = NEW.draft_id
			ORDER BY decision.candidate_id, decision.decided_at DESC, decision.id DESC
		)
		SELECT 1
		FROM latest_decisions latest
		WHERE NOT (NEW.decision_record_ids ? latest.id::text)
	) THEN
		RAISE EXCEPTION 'investor_update_decision_snapshot_stale' USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "investor_update_draft_subject_revision" BEFORE UPDATE ON "investor_update_drafts" FOR EACH ROW EXECUTE FUNCTION "investor_update_version_subject_change"();--> statement-breakpoint
CREATE TRIGGER "investor_update_candidate_revision" AFTER INSERT ON "investor_update_candidates" FOR EACH ROW EXECUTE FUNCTION "investor_update_advance_draft_revision"();--> statement-breakpoint
CREATE TRIGGER "investor_update_decision_revision" AFTER INSERT ON "investor_update_candidate_decisions" FOR EACH ROW EXECUTE FUNCTION "investor_update_advance_draft_revision"();--> statement-breakpoint
CREATE TRIGGER "investor_update_candidates_immutable" BEFORE UPDATE OR DELETE ON "investor_update_candidates" FOR EACH ROW EXECUTE FUNCTION "investor_update_prevent_ledger_mutation"();--> statement-breakpoint
CREATE TRIGGER "investor_update_decisions_immutable" BEFORE UPDATE OR DELETE ON "investor_update_candidate_decisions" FOR EACH ROW EXECUTE FUNCTION "investor_update_prevent_ledger_mutation"();--> statement-breakpoint
CREATE TRIGGER "investor_update_approval_snapshot_guard" BEFORE INSERT ON "investor_update_final_approvals" FOR EACH ROW EXECUTE FUNCTION "investor_update_validate_approval_snapshot"();--> statement-breakpoint
CREATE TRIGGER "investor_update_approvals_immutable" BEFORE UPDATE OR DELETE ON "investor_update_final_approvals" FOR EACH ROW EXECUTE FUNCTION "investor_update_prevent_ledger_mutation"();--> statement-breakpoint
CREATE TRIGGER "investor_update_delivery_events_immutable" BEFORE UPDATE OR DELETE ON "investor_update_delivery_events" FOR EACH ROW EXECUTE FUNCTION "investor_update_prevent_ledger_mutation"();
