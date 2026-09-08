import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type {
  InvestorContributionKnowledge,
  InvestorStakeholderRole,
  InvestorUpdateCandidateKind,
  InvestorUpdateDecision,
  InvestorUpdateDeliveryEventType,
  InvestorUpdateRecipientSegment,
  InvestorUpdateTrackingSettings,
} from '@/lib/investors/update-contract';
import { memorySourceRecords } from './memory';

// ============================================================================
// Investor Portal Schema
// ============================================================================
// Token-gated investor portal with pipeline CRM, engagement scoring,
// and automated follow-ups. Used by investors.jov.ie.
// ============================================================================

/**
 * Pipeline stages for investor links.
 *
 *   shared ──▶ viewed ──▶ engaged ──▶ meeting_booked ──▶ committed ──▶ wired
 *                │           │                                │
 *                └───────────┴────────────────────────────────┴──▶ passed
 *                                                                  declined
 */
export const investorStageEnum = pgEnum('investor_stage', [
  'shared',
  'viewed',
  'engaged',
  'meeting_booked',
  'committed',
  'wired',
  'passed',
  'declined',
]);

/**
 * Shareable token-gated links for investors.
 * Each link maps to one investor and tracks their pipeline stage.
 */
export const investorLinks = pgTable(
  'investor_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    label: text('label').notNull(),
    email: text('email'),
    investorName: text('investor_name'),
    stage: investorStageEnum('stage').notNull().default('shared'),
    engagementScore: integer('engagement_score').notNull().default(0),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at'),
    lastEmailSentAt: timestamp('last_email_sent_at'),
    emailSequenceStep: integer('email_sequence_step').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    tokenIdx: index('idx_investor_links_token').on(table.token),
    stageIdx: index('idx_investor_links_stage').on(table.stage),
    isActiveIdx: index('idx_investor_links_is_active').on(table.isActive),
  })
);

export const insertInvestorLinkSchema = createInsertSchema(investorLinks);
export const selectInvestorLinkSchema = createSelectSchema(investorLinks);
export type InvestorLink = typeof investorLinks.$inferSelect;
export type NewInvestorLink = typeof investorLinks.$inferInsert;

/**
 * Granular page view tracking for investor links.
 * Records every page view with optional duration hint from client heartbeat.
 */
export const investorViews = pgTable(
  'investor_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorLinkId: uuid('investor_link_id')
      .notNull()
      .references(() => investorLinks.id, { onDelete: 'cascade' }),
    pagePath: text('page_path').notNull(),
    durationHintMs: integer('duration_hint_ms'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  },
  table => ({
    linkViewedIdx: index('idx_investor_views_link_viewed').on(
      table.investorLinkId,
      table.viewedAt
    ),
  })
);

export const insertInvestorViewSchema = createInsertSchema(investorViews);
export const selectInvestorViewSchema = createSelectSchema(investorViews);
export type InvestorView = typeof investorViews.$inferSelect;
export type NewInvestorView = typeof investorViews.$inferInsert;

/**
 * Portal-level configuration (single row).
 * Controls fundraise progress display, button URLs, follow-up settings.
 */
export const investorSettings = pgTable('investor_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  showProgressBar: boolean('show_progress_bar').notNull().default(false),
  raiseTarget: integer('raise_target'),
  committedAmount: integer('committed_amount'),
  investorCount: integer('investor_count'),
  bookCallUrl: text('book_call_url'),
  investUrl: text('invest_url'),
  slackWebhookUrl: text('slack_webhook_url'),
  followupEnabled: boolean('followup_enabled').notNull().default(false),
  followupDelayHours: integer('followup_delay_hours').notNull().default(48),
  engagedThreshold: integer('engaged_threshold').notNull().default(50),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertInvestorSettingsSchema =
  createInsertSchema(investorSettings);
export const selectInvestorSettingsSchema =
  createSelectSchema(investorSettings);
export type InvestorSettings = typeof investorSettings.$inferSelect;
export type NewInvestorSettings = typeof investorSettings.$inferInsert;

// ============================================================================
// Approval-First Investor Updates
// ============================================================================

/**
 * One living draft per reporting month. Candidate decisions and final approvals
 * remain separate so Share never means Send.
 */
export const investorUpdateDrafts = pgTable(
  'investor_update_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    subject: text('subject').notNull(),
    /** Monotonic snapshot version. DB triggers advance it with every draft input mutation. */
    revision: integer('revision').notNull().default(0),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    periodUnique: uniqueIndex('investor_update_drafts_period_unique').on(
      table.periodStart
    ),
    periodIsMonthStart: check(
      'investor_update_drafts_period_month_start',
      drizzleSql`${table.periodStart} = date_trunc('month', ${table.periodStart})::date`
    ),
  })
);

/** Source-backed candidate win or optional ask awaiting founder judgment. */
export const investorUpdateCandidates = pgTable(
  'investor_update_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => investorUpdateDrafts.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<InvestorUpdateCandidateKind>().notNull(),
    category: text('category').notNull(),
    metricLabel: text('metric_label').notNull(),
    metricValue: text('metric_value').notNull(),
    metricUnit: text('metric_unit').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    sourceRecordId: uuid('source_record_id')
      .notNull()
      .references(() => memorySourceRecords.id, { onDelete: 'restrict' }),
    sourceLabel: text('source_label').notNull(),
    sourceUrl: text('source_url'),
    sourceObservedAt: timestamp('source_observed_at', {
      withTimezone: true,
    }).notNull(),
    confidence: real('confidence').notNull(),
    caveats: jsonb('caveats').$type<string[]>().notNull().default([]),
    proposedClaim: text('proposed_claim').notNull(),
    relevanceScore: real('relevance_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    draftRankIdx: index('investor_update_candidates_draft_rank_idx').on(
      table.draftId,
      table.relevanceScore,
      table.createdAt
    ),
    sourceIdx: index('investor_update_candidates_source_idx').on(
      table.sourceRecordId
    ),
    kindValid: check(
      'investor_update_candidates_kind_valid',
      drizzleSql`${table.kind} in ('win', 'ask')`
    ),
    confidenceRange: check(
      'investor_update_candidates_confidence_range',
      drizzleSql`${table.confidence} between 0 and 1`
    ),
    relevanceRange: check(
      'investor_update_candidates_relevance_range',
      drizzleSql`${table.relevanceScore} between 0 and 1`
    ),
    metricWindowValid: check(
      'investor_update_candidates_metric_window_valid',
      drizzleSql`${table.windowEnd} >= ${table.windowStart}`
    ),
  })
);

/** Append-only founder decision ledger. Latest row is the current decision. */
export const investorUpdateCandidateDecisions = pgTable(
  'investor_update_candidate_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => investorUpdateCandidates.id, { onDelete: 'restrict' }),
    decision: text('decision').$type<InvestorUpdateDecision>().notNull(),
    editedClaim: text('edited_claim'),
    decidedByUserId: text('decided_by_user_id').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    candidateDecisionIdx: index(
      'investor_update_candidate_decisions_candidate_time_idx'
    ).on(table.candidateId, table.decidedAt, table.id),
    decisionValid: check(
      'investor_update_candidate_decisions_valid',
      drizzleSql`${table.decision} in ('share', 'exclude', 'edit')`
    ),
    editedClaimValid: check(
      'investor_update_candidate_decisions_edit_copy_valid',
      drizzleSql`(${table.decision} = 'edit' and nullif(trim(${table.editedClaim}), '') is not null) or (${table.decision} <> 'edit' and ${table.editedClaim} is null)`
    ),
  })
);

/**
 * Separate manual final approval of exact copy and aggregate audience shape.
 * No contact data or provider send identifier is stored here.
 */
export const investorUpdateFinalApprovals = pgTable(
  'investor_update_final_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => investorUpdateDrafts.id, { onDelete: 'restrict' }),
    renderedCopy: text('rendered_copy').notNull(),
    copyHash: text('copy_hash').notNull(),
    snapshotFingerprint: text('snapshot_fingerprint').notNull(),
    /** Draft revision held and verified by the approval insert trigger. */
    draftRevision: integer('draft_revision').notNull(),
    decisionRecordIds: jsonb('decision_record_ids').$type<string[]>().notNull(),
    recipientSegments: jsonb('recipient_segments')
      .$type<InvestorUpdateRecipientSegment[]>()
      .notNull(),
    recipientCount: integer('recipient_count').notNull(),
    trackingSettings: jsonb('tracking_settings')
      .$type<InvestorUpdateTrackingSettings>()
      .notNull()
      .default({
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      }),
    approvedByUserId: text('approved_by_user_id').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => ({
    draftApprovalIdx: index(
      'investor_update_final_approvals_draft_time_idx'
    ).on(table.draftId, table.approvedAt, table.id),
    recipientCountValid: check(
      'investor_update_final_approvals_recipient_count_valid',
      drizzleSql`${table.recipientCount} > 0`
    ),
    approvalWindowValid: check(
      'investor_update_final_approvals_window_valid',
      drizzleSql`${table.expiresAt} > ${table.approvedAt}`
    ),
    trackingDisabled: check(
      'investor_update_final_approvals_tracking_disabled',
      drizzleSql`coalesce((${table.trackingSettings} ->> 'opens')::boolean, false) = false and coalesce((${table.trackingSettings} ->> 'clicks')::boolean, false) = false`
    ),
  })
);

/** Provider-independent observations. Recording an event never sends anything. */
export const investorUpdateDeliveryEvents = pgTable(
  'investor_update_delivery_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => investorUpdateFinalApprovals.id, {
        onDelete: 'restrict',
      }),
    eventType: text('event_type')
      .$type<InvestorUpdateDeliveryEventType>()
      .notNull(),
    recipientCount: integer('recipient_count').notNull(),
    externalReference: text('external_reference').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedByUserId: text('recorded_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    approvalEventIdx: index('investor_update_delivery_events_approval_idx').on(
      table.approvalId,
      table.occurredAt
    ),
    externalEventUnique: uniqueIndex(
      'investor_update_delivery_events_external_unique'
    ).on(table.approvalId, table.eventType, table.externalReference),
    eventTypeValid: check(
      'investor_update_delivery_events_type_valid',
      drizzleSql`${table.eventType} in ('provider_accepted', 'delivered', 'bounced', 'failed')`
    ),
    recipientCountValid: check(
      'investor_update_delivery_events_recipient_count_valid',
      drizzleSql`${table.recipientCount} >= 0`
    ),
  })
);

/**
 * PII-minimal stakeholder concept. It intentionally has no email, ownership,
 * instrument, dilution, or legal-status fields.
 */
export const investorStakeholderRecords = pgTable(
  'investor_stakeholder_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referenceLabel: text('reference_label').notNull(),
    role: text('role').$type<InvestorStakeholderRole>().notNull(),
    contributionKnowledge: text('contribution_knowledge')
      .$type<InvestorContributionKnowledge>()
      .notNull()
      .default('unknown'),
    contributionAmountCents: integer('contribution_amount_cents'),
    contributionCurrency: text('contribution_currency'),
    contributionSourceRecordId: uuid(
      'contribution_source_record_id'
    ).references(() => memorySourceRecords.id, { onDelete: 'restrict' }),
    contributionAsOf: timestamp('contribution_as_of', {
      withTimezone: true,
    }),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    roleIdx: index('investor_stakeholder_records_role_idx').on(table.role),
    sourceIdx: index('investor_stakeholder_records_source_idx').on(
      table.contributionSourceRecordId
    ),
    roleValid: check(
      'investor_stakeholder_records_role_valid',
      drizzleSql`${table.role} in ('investor', 'advisor', 'contributor', 'founder_self')`
    ),
    knowledgeValid: check(
      'investor_stakeholder_records_knowledge_valid',
      drizzleSql`${table.contributionKnowledge} in ('known', 'estimated', 'unknown')`
    ),
    contributionObservationValid: check(
      'investor_stakeholder_records_contribution_valid',
      drizzleSql`(${table.contributionKnowledge} = 'unknown' and ${table.contributionAmountCents} is null and ${table.contributionCurrency} is null and ${table.contributionSourceRecordId} is null and ${table.contributionAsOf} is null) or (${table.contributionKnowledge} in ('known', 'estimated') and ${table.contributionAmountCents} >= 0 and ${table.contributionCurrency} ~ '^[A-Z]{3}$' and ${table.contributionSourceRecordId} is not null and ${table.contributionAsOf} is not null)`
    ),
  })
);

export const insertInvestorUpdateDraftSchema =
  createInsertSchema(investorUpdateDrafts);
export const selectInvestorUpdateDraftSchema =
  createSelectSchema(investorUpdateDrafts);
export const insertInvestorUpdateCandidateSchema = createInsertSchema(
  investorUpdateCandidates
);
export const selectInvestorUpdateCandidateSchema = createSelectSchema(
  investorUpdateCandidates
);
export const insertInvestorUpdateCandidateDecisionSchema = createInsertSchema(
  investorUpdateCandidateDecisions
);
export const selectInvestorUpdateCandidateDecisionSchema = createSelectSchema(
  investorUpdateCandidateDecisions
);
export const insertInvestorUpdateFinalApprovalSchema = createInsertSchema(
  investorUpdateFinalApprovals
);
export const selectInvestorUpdateFinalApprovalSchema = createSelectSchema(
  investorUpdateFinalApprovals
);
export const insertInvestorUpdateDeliveryEventSchema = createInsertSchema(
  investorUpdateDeliveryEvents
);
export const selectInvestorUpdateDeliveryEventSchema = createSelectSchema(
  investorUpdateDeliveryEvents
);
export const insertInvestorStakeholderRecordSchema = createInsertSchema(
  investorStakeholderRecords
);
export const selectInvestorStakeholderRecordSchema = createSelectSchema(
  investorStakeholderRecords
);

export type InvestorUpdateDraft = typeof investorUpdateDrafts.$inferSelect;
export type InvestorUpdateCandidate =
  typeof investorUpdateCandidates.$inferSelect;
export type InvestorUpdateCandidateDecision =
  typeof investorUpdateCandidateDecisions.$inferSelect;
export type InvestorUpdateFinalApproval =
  typeof investorUpdateFinalApprovals.$inferSelect;
export type InvestorUpdateDeliveryEvent =
  typeof investorUpdateDeliveryEvents.$inferSelect;
export type InvestorStakeholderRecord =
  typeof investorStakeholderRecords.$inferSelect;
