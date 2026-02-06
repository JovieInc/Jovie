import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  ingestionSourceTypeEnum,
  socialAccountStatusEnum,
  socialLinkStateEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// Social links table
export const socialLinks = pgTable(
  'social_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    platformType: text('platform_type').notNull(),
    url: text('url').notNull(),
    displayText: text('display_text'),
    sortOrder: integer('sort_order').default(0),
    clicks: integer('clicks').default(0),
    isActive: boolean('is_active').default(true),
    state: socialLinkStateEnum('state').default('active').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 })
      .default('1.00')
      .notNull(),
    sourcePlatform: text('source_platform'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    evidence: jsonb('evidence')
      .$type<{ sources?: string[]; signals?: string[] }>()
      .default({}),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileStateIdx: index('social_links_creator_profile_state_idx').on(
      table.creatorProfileId,
      table.state,
      table.createdAt
    ),
    // Performance index: dashboard link count queries
    activeLinksIndex: index('idx_social_links_active').on(
      table.creatorProfileId,
      table.isActive,
      table.state
    ),
  })
);

// Social accounts table (for ingested/suspected accounts)
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    handle: text('handle'),
    url: text('url'),
    status: socialAccountStatusEnum('status').default('suspected').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).default(
      '0.00'
    ),
    isVerifiedFlag: boolean('is_verified_flag').default(false),
    paidFlag: boolean('paid_flag').default(false),
    rawData: jsonb('raw_data').$type<Record<string, unknown>>().default({}),
    sourcePlatform: text('source_platform'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('ingested')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Covers: WHERE creatorProfileId = ? AND platform = ? AND status = ?
    profilePlatformStatusIdx: index(
      'idx_social_accounts_profile_platform_status'
    ).on(table.creatorProfileId, table.platform, table.status),
  })
);

// Wrapped links table (URL shortener/wrapper)
export const wrappedLinks = pgTable('wrapped_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortId: text('short_id').notNull().unique(),
  encryptedUrl: text('encrypted_url').notNull(),
  kind: text('kind').notNull(),
  domain: text('domain').notNull(),
  category: text('category'),
  titleAlias: text('title_alias'),
  clickCount: integer('click_count').default(0),
  createdBy: text('created_by'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Signed link access table (for secure link access tracking)
export const signedLinkAccess = pgTable('signed_link_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: text('link_id').notNull(),
  signedToken: text('signed_token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isUsed: boolean('is_used').default(false),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Dashboard idempotency keys for API deduplication
export const dashboardIdempotencyKeys = pgTable(
  'dashboard_idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    keyUserEndpointUnique: uniqueIndex(
      'dashboard_idempotency_keys_key_user_endpoint_unique'
    ).on(table.key, table.userId, table.endpoint),
    expiresAtIndex: index('dashboard_idempotency_keys_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

// Schema validations
export const insertSocialLinkSchema = createInsertSchema(socialLinks);
export const selectSocialLinkSchema = createSelectSchema(socialLinks);

export const insertSocialAccountSchema = createInsertSchema(socialAccounts);
export const selectSocialAccountSchema = createSelectSchema(socialAccounts);

export const insertWrappedLinkSchema = createInsertSchema(wrappedLinks);
export const selectWrappedLinkSchema = createSelectSchema(wrappedLinks);

export const insertSignedLinkAccessSchema =
  createInsertSchema(signedLinkAccess);
export const selectSignedLinkAccessSchema =
  createSelectSchema(signedLinkAccess);

// Types
export type SocialLink = typeof socialLinks.$inferSelect;
export type NewSocialLink = typeof socialLinks.$inferInsert;

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

export type WrappedLink = typeof wrappedLinks.$inferSelect;
export type NewWrappedLink = typeof wrappedLinks.$inferInsert;

export type SignedLinkAccess = typeof signedLinkAccess.$inferSelect;
export type NewSignedLinkAccess = typeof signedLinkAccess.$inferInsert;

export type DashboardIdempotencyKey =
  typeof dashboardIdempotencyKeys.$inferSelect;
export type NewDashboardIdempotencyKey =
  typeof dashboardIdempotencyKeys.$inferInsert;
