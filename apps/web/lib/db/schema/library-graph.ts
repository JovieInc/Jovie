import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  decimal,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import { creatorProfiles } from './profiles';

export const libraryEntityTypeEnum = pgEnum('library_entity_type', [
  'creator_document',
  'release',
  'recording',
  'youtube_video',
  'social_content',
  'merch_product',
  'artist',
  'brand',
  'source_link',
  'offer',
  'provider_placement',
]);

export const libraryRelationshipKindEnum = pgEnum('library_relationship_kind', [
  'release_context',
  'collaborator_credit',
  'features_merch',
  'mentions_brand',
  'uses_tracked_link',
  'promotes_offer',
  'youtube_product_placement',
]);

export const libraryRelationshipStatusEnum = pgEnum(
  'library_relationship_status',
  ['suggested', 'active', 'rejected', 'removed']
);

export const artistRuleStrengthEnum = pgEnum('artist_rule_strength', [
  'hard_constraint',
  'preference',
]);

export const artistRuleScopeEnum = pgEnum('artist_rule_scope', [
  'artist',
  'channel',
  'release',
  'item_kind',
  'item',
]);

export const artistRuleStatusEnum = pgEnum('artist_rule_status', [
  'suggested',
  'active',
  'superseded',
  'revoked',
]);

export const artistRuleEventTypeEnum = pgEnum('artist_rule_event_type', [
  'suggested',
  'activated',
  'exception_granted',
  'superseded',
  'revoked',
  'evaluated',
]);

export const optimizationExperimentStatusEnum = pgEnum(
  'optimization_experiment_status',
  ['draft', 'running', 'paused', 'decided', 'cancelled']
);

export interface LibraryRelationshipEvidence {
  readonly source: string;
  readonly sourceId?: string;
  readonly rationale?: string;
  readonly observedAt?: string;
  readonly reviewerNote?: string;
}

export interface ArtistRuleProvenance {
  readonly source: 'artist' | 'authorized_team' | 'memory' | 'contract';
  readonly sourceId?: string;
  readonly quote?: string;
  readonly capturedAt: string;
}

export const creatorBrands = pgTable(
  'creator_brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    normalizedName: text('normalized_name').notNull(),
    displayName: text('display_name').notNull(),
    websiteUrl: text('website_url'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('creator_brands_profile_name_unique').on(
      table.creatorProfileId,
      table.normalizedName
    ),
  ]
);

export const creatorOffers = pgTable(
  'creator_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => creatorBrands.id, {
      onDelete: 'set null',
    }),
    offerType: text('offer_type')
      .$type<'affiliate' | 'sponsor' | 'owned_merch'>()
      .notNull(),
    name: text('name').notNull(),
    destinationUrl: text('destination_url').notNull(),
    sourceLinkId: uuid('source_link_id'),
    disclosureText: text('disclosure_text'),
    terms: jsonb('terms')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text('status')
      .$type<'draft' | 'active' | 'expired' | 'revoked'>()
      .notNull()
      .default('draft'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('creator_offers_profile_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
  ]
);

export const libraryRelationships = pgTable(
  'library_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    kind: libraryRelationshipKindEnum('kind').notNull(),
    subjectType: libraryEntityTypeEnum('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    objectType: libraryEntityTypeEnum('object_type').notNull(),
    objectId: text('object_id').notNull(),
    status: libraryRelationshipStatusEnum('status')
      .notNull()
      .default('suggested'),
    confidence: decimal('confidence', { precision: 5, scale: 4 }),
    evidence: jsonb('evidence').$type<LibraryRelationshipEvidence>().notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('library_relationships_identity_unique').on(
      table.creatorProfileId,
      table.kind,
      table.subjectType,
      table.subjectId,
      table.objectType,
      table.objectId
    ),
    index('library_relationships_subject_idx').on(
      table.creatorProfileId,
      table.subjectType,
      table.subjectId,
      table.status
    ),
    index('library_relationships_object_idx').on(
      table.creatorProfileId,
      table.objectType,
      table.objectId,
      table.status
    ),
  ]
);

export const artistRules = pgTable(
  'artist_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    ruleKey: text('rule_key').notNull(),
    instruction: text('instruction').notNull(),
    strength: artistRuleStrengthEnum('strength').notNull(),
    scope: artistRuleScopeEnum('scope').notNull().default('artist'),
    scopeValue: text('scope_value'),
    allowOverride: boolean('allow_override').notNull().default(false),
    status: artistRuleStatusEnum('status').notNull().default('suggested'),
    provenance: jsonb('provenance').$type<ArtistRuleProvenance>().notNull(),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    supersedesRuleId: uuid('supersedes_rule_id').references(
      (): AnyPgColumn => artistRules.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('artist_rules_profile_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
    index('artist_rules_resolution_idx').on(
      table.creatorProfileId,
      table.category,
      table.ruleKey,
      table.scope,
      table.scopeValue
    ),
  ]
);

export const artistRuleEvents = pgTable(
  'artist_rule_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => artistRules.id, { onDelete: 'cascade' }),
    eventType: artistRuleEventTypeEnum('event_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('artist_rule_events_rule_created_idx').on(
      table.ruleId,
      table.createdAt
    ),
  ]
);

export const artistRuleExceptions = pgTable(
  'artist_rule_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => artistRules.id, { onDelete: 'cascade' }),
    scope: artistRuleScopeEnum('scope').notNull(),
    scopeValue: text('scope_value').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    authorizedBy: uuid('authorized_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('artist_rule_exceptions_rule_scope_idx').on(
      table.ruleId,
      table.scope,
      table.scopeValue,
      table.createdAt
    ),
  ]
);

export const optimizationExperiments = pgTable(
  'optimization_experiments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    subjectType: libraryEntityTypeEnum('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    objective: text('objective').notNull(),
    guardrails: jsonb('guardrails')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    variants: jsonb('variants')
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
    status: optimizationExperimentStatusEnum('status')
      .notNull()
      .default('draft'),
    winnerVariantKey: text('winner_variant_key'),
    decisionEvidence:
      jsonb('decision_evidence').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('optimization_experiments_subject_idx').on(
      table.creatorProfileId,
      table.subjectType,
      table.subjectId,
      table.status
    ),
  ]
);

export const insertLibraryRelationshipSchema =
  createInsertSchema(libraryRelationships);
export const selectLibraryRelationshipSchema =
  createSelectSchema(libraryRelationships);
export const insertArtistRuleSchema = createInsertSchema(artistRules);
export const selectArtistRuleSchema = createSelectSchema(artistRules);
export const insertArtistRuleEventSchema = createInsertSchema(artistRuleEvents);
export const selectArtistRuleEventSchema = createSelectSchema(artistRuleEvents);
export const insertArtistRuleExceptionSchema =
  createInsertSchema(artistRuleExceptions);
export const selectArtistRuleExceptionSchema =
  createSelectSchema(artistRuleExceptions);
export const insertCreatorBrandSchema = createInsertSchema(creatorBrands);
export const selectCreatorBrandSchema = createSelectSchema(creatorBrands);
export const insertCreatorOfferSchema = createInsertSchema(creatorOffers);
export const selectCreatorOfferSchema = createSelectSchema(creatorOffers);
export const insertOptimizationExperimentSchema = createInsertSchema(
  optimizationExperiments
);
export const selectOptimizationExperimentSchema = createSelectSchema(
  optimizationExperiments
);

export type LibraryRelationship = typeof libraryRelationships.$inferSelect;
export type NewLibraryRelationship = typeof libraryRelationships.$inferInsert;
export type ArtistRule = typeof artistRules.$inferSelect;
export type NewArtistRule = typeof artistRules.$inferInsert;
export type ArtistRuleEvent = typeof artistRuleEvents.$inferSelect;
export type ArtistRuleException = typeof artistRuleExceptions.$inferSelect;
export type CreatorBrand = typeof creatorBrands.$inferSelect;
export type CreatorOffer = typeof creatorOffers.$inferSelect;
export type OptimizationExperiment =
  typeof optimizationExperiments.$inferSelect;
