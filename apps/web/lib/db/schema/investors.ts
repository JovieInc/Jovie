import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

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
