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
CREATE INDEX IF NOT EXISTS "investor_update_final_approvals_draft_time_idx" ON "investor_update_final_approvals" USING btree ("draft_id","approved_at","id");
