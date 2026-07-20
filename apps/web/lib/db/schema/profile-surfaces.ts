import { sql as drizzleSql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import { users } from './auth';
import { creatorProfiles } from './profiles';

/** Canonical, account-neutral public identity surfaces for an artist. */
export const profileSurfaces = pgTable(
  'profile_surfaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    platform: text('platform').notNull(),
    displayName: text('display_name'),
    handle: text('handle'),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    externalId: text('external_id'),
    qualificationStatus: text('qualification_status')
      .default('suggested')
      .notNull(),
    identityConfidence: numeric('identity_confidence', {
      precision: 3,
      scale: 2,
    }),
    isOfficial: boolean('is_official').default(false).notNull(),
    availability: text('availability').default('eligible').notNull(),
    monitoringPriority: integer('monitoring_priority').default(0).notNull(),
    lastDiscoveredAt: timestamp('last_discovered_at', { withTimezone: true }),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    replacedBySurfaceId: uuid('replaced_by_surface_id').references(
      (): AnyPgColumn => profileSurfaces.id,
      { onDelete: 'set null' }
    ),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('profile_surfaces_live_url_uniq')
      .on(table.creatorProfileId, table.normalizedUrl)
      .where(drizzleSql`retired_at IS NULL`),
    index('profile_surfaces_profile_kind_idx').on(
      table.creatorProfileId,
      table.kind,
      table.monitoringPriority
    ),
    index('profile_surfaces_profile_availability_idx').on(
      table.creatorProfileId,
      table.availability,
      table.retiredAt
    ),
  ]
);

/** Every upstream claim that contributes to a canonical surface. */
export const profileSurfaceSources = pgTable(
  'profile_surface_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surfaceId: uuid('surface_id')
      .notNull()
      .references(() => profileSurfaces.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceRefId: text('source_ref_id').notNull(),
    sourceUrl: text('source_url'),
    externalId: text('external_id'),
    reconciliationGeneration: integer('reconciliation_generation')
      .default(1)
      .notNull(),
    isLive: boolean('is_live').default(true).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  table => [
    uniqueIndex('profile_surface_sources_identity_uniq').on(
      table.sourceType,
      table.sourceRefId
    ),
    index('profile_surface_sources_surface_live_idx').on(
      table.surfaceId,
      table.isLive,
      table.lastSeenAt
    ),
  ]
);

/** Immutable evidence trail for qualification state transitions. */
export const profileSurfaceQualificationEvents = pgTable(
  'profile_surface_qualification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surfaceId: uuid('surface_id')
      .notNull()
      .references(() => profileSurfaces.id, { onDelete: 'cascade' }),
    previousStatus: text('previous_status'),
    nextStatus: text('next_status').notNull(),
    evidence: jsonb('evidence')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('profile_surface_qualification_events_surface_idx').on(
      table.surfaceId,
      table.createdAt
    ),
  ]
);

/** Account-specific monitoring choices; never stored on canonical surfaces. */
export const profileSurfaceMonitoringPreferences = pgTable(
  'profile_surface_monitoring_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    surfaceId: uuid('surface_id')
      .notNull()
      .references(() => profileSurfaces.id, { onDelete: 'cascade' }),
    state: text('state').default('active').notNull(),
    userPaused: boolean('user_paused').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('profile_surface_monitoring_preferences_user_surface_uniq').on(
      table.userId,
      table.surfaceId
    ),
    index('profile_surface_monitoring_preferences_account_idx').on(
      table.userId,
      table.creatorProfileId,
      table.state
    ),
  ]
);

export const insertProfileSurfaceSchema = createInsertSchema(profileSurfaces);
export const selectProfileSurfaceSchema = createSelectSchema(profileSurfaces);
export const insertProfileSurfaceSourceSchema = createInsertSchema(
  profileSurfaceSources
);
export const selectProfileSurfaceSourceSchema = createSelectSchema(
  profileSurfaceSources
);

export type ProfileSurface = typeof profileSurfaces.$inferSelect;
export type NewProfileSurface = typeof profileSurfaces.$inferInsert;
export type ProfileSurfaceSource = typeof profileSurfaceSources.$inferSelect;
export type NewProfileSurfaceSource = typeof profileSurfaceSources.$inferInsert;
export type ProfileSurfaceQualificationEvent =
  typeof profileSurfaceQualificationEvents.$inferSelect;
export type ProfileSurfaceMonitoringPreference =
  typeof profileSurfaceMonitoringPreferences.$inferSelect;
