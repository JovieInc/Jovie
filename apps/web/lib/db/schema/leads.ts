import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import {
  leadAttributionStatusEnum,
  leadDiscoverySourceEnum,
  leadOutreachRouteEnum,
  leadOutreachStatusEnum,
  leadRampModeEnum,
  leadSourcePlatformEnum,
  leadStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

export interface LeadSignalSnapshot {
  verified: boolean | null;
  hasPaidTier: boolean | null;
  hasSpotifyLink: boolean;
  hasInstagram: boolean;
  musicToolsDetected: string[];
  allLinks: unknown[];
  hasTrackingPixels: boolean;
  trackingPixelPlatforms: string[];
  discoveryQuery: string | null;
  sourcePlatform: 'linktree' | 'beacons' | 'laylo';
}

export interface LeadGuardrailThresholds {
  minimumSampleSize: number;
  increaseClaimClickRate: number;
  holdClaimClickRateFloor: number;
  pauseClaimClickRateFloor: number;
  maxBounceComplaintRate: number;
  maxUnsubscribeRate: number;
  maxProviderFailureRate: number;
}

export interface LeadFunnelEventMetadata {
  [key: string]: unknown;
}

// Lead discovery pipeline — discovered Linktree profiles
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linktreeHandle: text('linktree_handle').notNull(),
    linktreeUrl: text('linktree_url').notNull(),
    discoverySource: leadDiscoverySourceEnum('discovery_source').notNull(),
    discoveryQuery: text('discovery_query'),
    sourcePlatform: leadSourcePlatformEnum('source_platform')
      .default('linktree')
      .notNull(),
    sourceHandle: text('source_handle'),
    sourceUrl: text('source_url'),

    // Extracted data (cached from Linktree scrape)
    displayName: text('display_name'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    contactEmail: text('contact_email'),

    // Qualification signals
    hasPaidTier: boolean('has_paid_tier'),
    isLinktreeVerified: boolean('is_linktree_verified'),
    hasSpotifyLink: boolean('has_spotify_link').default(false).notNull(),
    spotifyUrl: text('spotify_url'),
    hasInstagram: boolean('has_instagram').default(false).notNull(),
    instagramHandle: text('instagram_handle'),
    musicToolsDetected: text('music_tools_detected')
      .array()
      .default([])
      .notNull(),
    hasTrackingPixels: boolean('has_tracking_pixels').default(false).notNull(),
    trackingPixelPlatforms: text('tracking_pixel_platforms')
      .array()
      .default([])
      .notNull(),
    allLinks: jsonb('all_links'),
    signalSnapshot: jsonb('signal_snapshot').$type<LeadSignalSnapshot>(),

    // Scoring
    fitScore: integer('fit_score'),
    fitScoreBreakdown: jsonb('fit_score_breakdown'),

    // Lifecycle
    status: leadStatusEnum('status').default('discovered').notNull(),
    disqualificationReason: text('disqualification_reason'),
    qualifiedAt: timestamp('qualified_at'),
    disqualifiedAt: timestamp('disqualified_at'),
    approvedAt: timestamp('approved_at'),
    ingestedAt: timestamp('ingested_at'),
    rejectedAt: timestamp('rejected_at'),

    // Link to created profile after ingestion
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),

    // Enrichment data
    spotifyPopularity: integer('spotify_popularity'),
    spotifyFollowers: integer('spotify_followers'),
    releaseCount: integer('release_count'),
    latestReleaseDate: timestamp('latest_release_date'),
    priorityScore: real('priority_score'),

    // Email validation
    emailInvalid: boolean('email_invalid').default(false).notNull(),
    emailSuspicious: boolean('email_suspicious').default(false).notNull(),
    emailInvalidReason: text('email_invalid_reason'),

    // Representation detection
    hasRepresentation: boolean('has_representation').default(false).notNull(),
    representationSignal: text('representation_signal'),

    // Outreach pipeline
    outreachRoute: leadOutreachRouteEnum('outreach_route'),
    outreachStatus: leadOutreachStatusEnum('outreach_status'),
    claimToken: text('claim_token'),
    claimTokenHash: text('claim_token_hash'),
    claimTokenExpiresAt: timestamp('claim_token_expires_at'),
    instantlyLeadId: text('instantly_lead_id'),
    outreachQueuedAt: timestamp('outreach_queued_at'),
    dmSentAt: timestamp('dm_sent_at'),
    dmCopy: text('dm_copy'),
    firstContactedAt: timestamp('first_contacted_at'),
    lastContactedAt: timestamp('last_contacted_at'),
    signupUserId: uuid('signup_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    signupAt: timestamp('signup_at'),
    paidAt: timestamp('paid_at'),
    paidSubscriptionId: text('paid_subscription_id'),
    attributionStatus: leadAttributionStatusEnum('attribution_status')
      .default('unattributed')
      .notNull(),

    scrapeAttempts: integer('scrape_attempts').default(0).notNull(),
    scrapedAt: timestamp('scraped_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    linktreeHandleUnique: uniqueIndex('idx_leads_linktree_handle').on(
      table.linktreeHandle
    ),
    statusFitScoreIndex: index('idx_leads_status_fit_score').on(
      table.status,
      table.fitScore
    ),
    creatorProfileIdIndex: index('idx_leads_creator_profile_id').on(
      table.creatorProfileId
    ),
    outreachRoutePriorityIndex: index('idx_leads_outreach_route_priority').on(
      table.outreachRoute,
      table.priorityScore
    ),
    outreachStatusIndex: index('idx_leads_outreach_status').on(
      table.outreachStatus
    ),
    signupUserIdIndex: index('idx_leads_signup_user_id').on(table.signupUserId),
    attributionStatusIndex: index('idx_leads_attribution_status').on(
      table.attributionStatus
    ),
  })
);

// Admin-configurable pipeline settings (singleton row)
export const leadPipelineSettings = pgTable('lead_pipeline_settings', {
  id: integer('id').primaryKey().default(1),
  enabled: boolean('enabled').default(false).notNull(),
  discoveryEnabled: boolean('discovery_enabled').default(true).notNull(),
  autoIngestEnabled: boolean('auto_ingest_enabled').default(false).notNull(),
  autoIngestMinFitScore: integer('auto_ingest_min_fit_score')
    .default(60)
    .notNull(),
  autoIngestDailyLimit: integer('auto_ingest_daily_limit')
    .default(10)
    .notNull(),
  autoIngestedToday: integer('auto_ingested_today').default(0).notNull(),
  autoIngestResetsAt: timestamp('auto_ingest_resets_at'),
  dailyQueryBudget: integer('daily_query_budget').default(100).notNull(),
  queriesUsedToday: integer('queries_used_today').default(0).notNull(),
  queryBudgetResetsAt: timestamp('query_budget_resets_at'),
  lastDiscoveryQueryIndex: integer('last_discovery_query_index')
    .default(0)
    .notNull(),
  dailySendCap: integer('daily_send_cap').default(10).notNull(),
  maxPerHour: integer('max_per_hour').default(5).notNull(),
  rampMode: leadRampModeEnum('ramp_mode').default('manual').notNull(),
  guardrailsEnabled: boolean('guardrails_enabled').default(true).notNull(),
  guardrailThresholds: jsonb('guardrail_thresholds')
    .$type<LeadGuardrailThresholds>()
    .default({
      minimumSampleSize: 30,
      increaseClaimClickRate: 0.06,
      holdClaimClickRateFloor: 0.03,
      pauseClaimClickRateFloor: 0.03,
      maxBounceComplaintRate: 0.03,
      maxUnsubscribeRate: 0.05,
      maxProviderFailureRate: 0.1,
    })
    .notNull(),
  dmTemplate: text('dm_template').default(
    "Hey {displayName}! I found your Linktree and love your music on Spotify. I built Jovie to help artists like you create a better link-in-bio. Here's your free page: {claimLink}"
  ),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Discovery keywords managed via admin UI
export const discoveryKeywords = pgTable(
  'discovery_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    query: text('query').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    resultsFoundTotal: integer('results_found_total').default(0).notNull(),
    searchOffset: integer('search_offset').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    queryUnique: uniqueIndex('idx_discovery_keywords_query').on(table.query),
  })
);

export const leadFunnelEvents = pgTable(
  'lead_funnel_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    channel: text('channel'),
    provider: text('provider'),
    campaignKey: text('campaign_key'),
    variantKey: text('variant_key'),
    metadata: jsonb('metadata').$type<LeadFunnelEventMetadata>(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    leadEventTypeUniqueIndex: uniqueIndex(
      'idx_lead_funnel_events_lead_event_type_unique'
    ).on(table.leadId, table.eventType),
    leadOccurredAtIndex: index('idx_lead_funnel_events_lead_occurred_at').on(
      table.leadId,
      table.occurredAt
    ),
    eventTypeOccurredAtIndex: index(
      'idx_lead_funnel_events_type_occurred_at'
    ).on(table.eventType, table.occurredAt),
  })
);

export const leadSearchResults = pgTable(
  'lead_search_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    query: text('query').notNull(),
    normalizedResultUrl: text('normalized_result_url').notNull(),
    sourcePlatform: leadSourcePlatformEnum('source_platform')
      .default('linktree')
      .notNull(),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    timesSeen: integer('times_seen').default(1).notNull(),
    lastRank: integer('last_rank'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    queryUrlUnique: uniqueIndex('idx_lead_search_results_query_url').on(
      table.query,
      table.normalizedResultUrl
    ),
    sourcePlatformSeenIndex: index('idx_lead_search_results_source_seen').on(
      table.sourcePlatform,
      table.lastSeenAt
    ),
  })
);

// Schema validations
export const insertLeadSchema = createInsertSchema(leads);
export const selectLeadSchema = createSelectSchema(leads);

export const insertLeadPipelineSettingsSchema =
  createInsertSchema(leadPipelineSettings);
export const selectLeadPipelineSettingsSchema =
  createSelectSchema(leadPipelineSettings);

export const insertDiscoveryKeywordSchema =
  createInsertSchema(discoveryKeywords);
export const selectDiscoveryKeywordSchema =
  createSelectSchema(discoveryKeywords);
export const insertLeadFunnelEventSchema = createInsertSchema(leadFunnelEvents);
export const selectLeadFunnelEventSchema = createSelectSchema(leadFunnelEvents);
export const insertLeadSearchResultSchema =
  createInsertSchema(leadSearchResults);
export const selectLeadSearchResultSchema =
  createSelectSchema(leadSearchResults);

// Types
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export type LeadPipelineSettings = typeof leadPipelineSettings.$inferSelect;
export type NewLeadPipelineSettings = typeof leadPipelineSettings.$inferInsert;

export type DiscoveryKeyword = typeof discoveryKeywords.$inferSelect;
export type NewDiscoveryKeyword = typeof discoveryKeywords.$inferInsert;
export type LeadFunnelEvent = typeof leadFunnelEvents.$inferSelect;
export type NewLeadFunnelEvent = typeof leadFunnelEvents.$inferInsert;
export type LeadSearchResult = typeof leadSearchResults.$inferSelect;
export type NewLeadSearchResult = typeof leadSearchResults.$inferInsert;
