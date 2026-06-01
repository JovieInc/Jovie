/**
 * Memory Core v0 Schema (evidence-backed entity graph)
 *
 * Canonical product memory source of truth for Jovie (JOV-2706 / gh-9872).
 * Every fact points back to evidence. All rows user-scoped + creatorProfileId where relevant.
 *
 * Design rules (verbatim from spec):
 * - Raw email bodies never copied.
 * - jsonb ONLY for flexible metadata; first-class columns + FKs for integrity.
 * - High-value indexes on user/profile/status/type/createdAt + relationship endpoints.
 * - Defer vector columns until pgvector/Neon validated.
 * - Reference (do not duplicate) connector_*, discog_*, artists, profiles, users.
 */

import {
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

// Enums (defined locally for v0 minimal blast radius; matches spec exactly)
export const memoryEntityTypeEnum = pgEnum('memory_entity_type', [
  'person',
  'artist',
  'song',
  'location',
  'studio',
  'company',
  'event',
  'project',
  'asset',
  'file',
  'release',
  'recording',
]);
export const memoryEntityTypeEnumValues = [
  'person',
  'artist',
  'song',
  'location',
  'studio',
  'company',
  'event',
  'project',
  'asset',
  'file',
  'release',
  'recording',
] as const;
export type MemoryEntityType = (typeof memoryEntityTypeEnumValues)[number];

export const memoryEntityStatusEnum = pgEnum('memory_entity_status', [
  'candidate',
  'confirmed',
  'rejected',
  'merged',
]);
export const memoryEntityStatusEnumValues = [
  'candidate',
  'confirmed',
  'rejected',
  'merged',
] as const;
export type MemoryEntityStatus = (typeof memoryEntityStatusEnumValues)[number];

export const memorySourceTypeEnum = pgEnum('memory_source_type', [
  'chat_message',
  'profile_photo',
  'uploaded_asset',
  'gmail_message',
  'calendar_event',
  'file',
  'web',
  'manual',
  'dev_fixture',
]);
export const memorySourceTypeEnumValues = [
  'chat_message',
  'profile_photo',
  'uploaded_asset',
  'gmail_message',
  'calendar_event',
  'file',
  'web',
  'manual',
  'dev_fixture',
] as const;
export type MemorySourceType = (typeof memorySourceTypeEnumValues)[number];

export const memoryObservationStatusEnum = pgEnum('memory_observation_status', [
  'proposed',
  'accepted',
  'rejected',
]);
export const memoryObservationStatusEnumValues = [
  'proposed',
  'accepted',
  'rejected',
] as const;
export type MemoryObservationStatus =
  (typeof memoryObservationStatusEnumValues)[number];

export const memoryOpportunityStatusEnum = pgEnum('memory_opportunity_status', [
  'pending',
  'approved',
  'dismissed',
  'completed',
  'failed',
]);
export const memoryOpportunityStatusEnumValues = [
  'pending',
  'approved',
  'dismissed',
  'completed',
  'failed',
] as const;
export type MemoryOpportunityStatus =
  (typeof memoryOpportunityStatusEnumValues)[number];

// 12 core tables (minimum per spec)

export const memorySourceRecords = pgTable(
  'memory_source_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id'),
    sourceType: memorySourceTypeEnum('source_type').notNull(),
    externalId: text('external_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userCreated: index('msr_user_created_idx').on(t.userId, t.createdAt),
    sourceType: index('msr_source_type_idx').on(t.sourceType),
    extUnique: uniqueIndex('msr_ext_unique').on(
      t.userId,
      t.sourceType,
      t.externalId
    ),
  })
);

export const memoryAssets = pgTable(
  'memory_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id'),
    sourceRecordId: uuid('source_record_id').references(
      () => memorySourceRecords.id,
      { onDelete: 'set null' }
    ),
    kind: text('kind').notNull(),
    url: text('url'),
    storageKey: text('storage_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userCreated: index('ma_user_created_idx').on(t.userId, t.createdAt),
    source: index('ma_source_idx').on(t.sourceRecordId),
  })
);

export const memoryEntities = pgTable(
  'memory_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id'),
    type: memoryEntityTypeEnum('type').notNull(),
    status: memoryEntityStatusEnum('status').notNull().default('candidate'),
    primaryName: text('primary_name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userTypeStatus: index('me_user_type_status_idx').on(
      t.userId,
      t.type,
      t.status
    ),
    creator: index('me_creator_idx').on(t.creatorProfileId),
  })
);

export const memoryEntityIdentities = pgTable(
  'memory_entity_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerId: text('provider_id').notNull(),
    confidence: text('confidence'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    entity: index('mei_entity_idx').on(t.entityId),
    provUnique: uniqueIndex('mei_prov_unique').on(
      t.entityId,
      t.provider,
      t.providerId
    ),
  })
);

export const memoryEntityAliases = pgTable(
  'memory_entity_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    entity: index('mea_entity_idx').on(t.entityId),
    alias: index('mea_alias_idx').on(t.alias),
  })
);

export const memoryObservations = pgTable(
  'memory_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    sourceRecordId: uuid('source_record_id').references(
      () => memorySourceRecords.id,
      { onDelete: 'set null' }
    ),
    status: memoryObservationStatusEnum('status').notNull().default('proposed'),
    fact: text('fact').notNull(),
    confidence: text('confidence'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userEntityStatus: index('mo_user_entity_status_idx').on(
      t.userId,
      t.entityId,
      t.status
    ),
    source: index('mo_source_idx').on(t.sourceRecordId),
  })
);

export const memoryEntityEdges = pgTable(
  'memory_entity_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromEntityId: uuid('from_entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    toEntityId: uuid('to_entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull(),
    weight: text('weight'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userFrom: index('mee_user_from_idx').on(t.userId, t.fromEntityId),
    userTo: index('mee_user_to_idx').on(t.userId, t.toEntityId),
    rel: index('mee_rel_idx').on(t.relation),
  })
);

export const memoryAssetEntityMentions = pgTable(
  'memory_asset_entity_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => memoryAssets.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    mentionType: text('mention_type'),
    confidence: text('confidence'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    asset: index('maem_asset_idx').on(t.assetId),
    entity: index('maem_entity_idx').on(t.entityId),
  })
);

export const memoryEvents = pgTable(
  'memory_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id'),
    sourceRecordId: uuid('source_record_id').references(
      () => memorySourceRecords.id,
      { onDelete: 'set null' }
    ),
    title: text('title'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userOccurred: index('mev_user_occurred_idx').on(t.userId, t.occurredAt),
  })
);

export const memoryEventParticipants = pgTable(
  'memory_event_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => memoryEvents.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => memoryEntities.id, { onDelete: 'cascade' }),
    role: text('role'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    event: index('mep_event_idx').on(t.eventId),
    entity: index('mep_entity_idx').on(t.entityId),
  })
);

export const memoryEnrichmentJobs = pgTable(
  'memory_enrichment_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetEntityId: uuid('target_entity_id').references(
      () => memoryEntities.id,
      { onDelete: 'set null' }
    ),
    jobType: text('job_type').notNull(),
    status: text('status').notNull().default('pending'),
    input: jsonb('input').$type<Record<string, unknown>>().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  t => ({
    userStatus: index('mej_user_status_idx').on(t.userId, t.status),
    target: index('mej_target_idx').on(t.targetEntityId),
  })
);

export const memoryOpportunities = pgTable(
  'memory_opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id'),
    entityId: uuid('entity_id').references(() => memoryEntities.id, {
      onDelete: 'set null',
    }),
    status: memoryOpportunityStatusEnum('status').notNull().default('pending'),
    title: text('title').notNull(),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    userStatus: index('mop_user_status_idx').on(t.userId, t.status),
    entity: index('mop_entity_idx').on(t.entityId),
  })
);

// Schema validations (drizzle-zod for all 12 tables — exhaustive per plan + 6 principles: completeness, explicit)
export const insertMemorySourceRecordSchema =
  createInsertSchema(memorySourceRecords);
export const selectMemorySourceRecordSchema =
  createSelectSchema(memorySourceRecords);

export const insertMemoryAssetSchema = createInsertSchema(memoryAssets);
export const selectMemoryAssetSchema = createSelectSchema(memoryAssets);

export const insertMemoryEntitySchema = createInsertSchema(memoryEntities);
export const selectMemoryEntitySchema = createSelectSchema(memoryEntities);

export const insertMemoryEntityIdentitySchema = createInsertSchema(
  memoryEntityIdentities
);
export const selectMemoryEntityIdentitySchema = createSelectSchema(
  memoryEntityIdentities
);

export const insertMemoryEntityAliasSchema =
  createInsertSchema(memoryEntityAliases);
export const selectMemoryEntityAliasSchema =
  createSelectSchema(memoryEntityAliases);

export const insertMemoryObservationSchema =
  createInsertSchema(memoryObservations);
export const selectMemoryObservationSchema =
  createSelectSchema(memoryObservations);

export const insertMemoryEntityEdgeSchema =
  createInsertSchema(memoryEntityEdges);
export const selectMemoryEntityEdgeSchema =
  createSelectSchema(memoryEntityEdges);

export const insertMemoryAssetEntityMentionSchema = createInsertSchema(
  memoryAssetEntityMentions
);
export const selectMemoryAssetEntityMentionSchema = createSelectSchema(
  memoryAssetEntityMentions
);

export const insertMemoryEventSchema = createInsertSchema(memoryEvents);
export const selectMemoryEventSchema = createSelectSchema(memoryEvents);

export const insertMemoryEventParticipantSchema = createInsertSchema(
  memoryEventParticipants
);
export const selectMemoryEventParticipantSchema = createSelectSchema(
  memoryEventParticipants
);

export const insertMemoryEnrichmentJobSchema =
  createInsertSchema(memoryEnrichmentJobs);
export const selectMemoryEnrichmentJobSchema =
  createSelectSchema(memoryEnrichmentJobs);

export const insertMemoryOpportunitySchema =
  createInsertSchema(memoryOpportunities);
export const selectMemoryOpportunitySchema =
  createSelectSchema(memoryOpportunities);

// Types (inferred for all 12 tables + enum value types)
export type MemorySourceRecord = typeof memorySourceRecords.$inferSelect;
export type NewMemorySourceRecord = typeof memorySourceRecords.$inferInsert;

export type MemoryAsset = typeof memoryAssets.$inferSelect;
export type NewMemoryAsset = typeof memoryAssets.$inferInsert;

export type MemoryEntity = typeof memoryEntities.$inferSelect;
export type NewMemoryEntity = typeof memoryEntities.$inferInsert;

export type MemoryEntityIdentity = typeof memoryEntityIdentities.$inferSelect;
export type NewMemoryEntityIdentity =
  typeof memoryEntityIdentities.$inferInsert;

export type MemoryEntityAlias = typeof memoryEntityAliases.$inferSelect;
export type NewMemoryEntityAlias = typeof memoryEntityAliases.$inferInsert;

export type MemoryObservation = typeof memoryObservations.$inferSelect;
export type NewMemoryObservation = typeof memoryObservations.$inferInsert;

export type MemoryEntityEdge = typeof memoryEntityEdges.$inferSelect;
export type NewMemoryEntityEdge = typeof memoryEntityEdges.$inferInsert;

export type MemoryAssetEntityMention =
  typeof memoryAssetEntityMentions.$inferSelect;
export type NewMemoryAssetEntityMention =
  typeof memoryAssetEntityMentions.$inferInsert;

export type MemoryEvent = typeof memoryEvents.$inferSelect;
export type NewMemoryEvent = typeof memoryEvents.$inferInsert;

export type MemoryEventParticipant =
  typeof memoryEventParticipants.$inferSelect;
export type NewMemoryEventParticipant =
  typeof memoryEventParticipants.$inferInsert;

export type MemoryEnrichmentJob = typeof memoryEnrichmentJobs.$inferSelect;
export type NewMemoryEnrichmentJob = typeof memoryEnrichmentJobs.$inferInsert;

export type MemoryOpportunity = typeof memoryOpportunities.$inferSelect;
export type NewMemoryOpportunity = typeof memoryOpportunities.$inferInsert;
