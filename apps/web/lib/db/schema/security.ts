import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import { creatorProfiles } from './profiles';

/**
 * Account-security audit trail (JOV-6600): append-only record of panic
 * containment runs, link restores, and sign-in alert markers.
 */
export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userCreatedIdx: index('idx_security_events_user_created').on(
      table.userId,
      table.createdAt
    ),
    typeIdx: index('idx_security_events_type').on(table.type),
  })
);

/**
 * Restorable point-in-time snapshots of a profile's social links
 * (JOV-6600). Written before each links mutation and before a panic
 * freeze so a bad change can be reverted to a known-good version.
 * Append-only; `reason` records why the snapshot exists.
 */
export const socialLinkSnapshots = pgTable(
  'social_link_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    // Link-set version at capture time (matches social_links.version).
    version: integer('version').notNull(),
    links: jsonb('links')
      .$type<
        {
          platform: string;
          platformType: string | null;
          url: string;
          displayText: string | null;
          sortOrder: number | null;
          isActive: boolean | null;
          state: string | null;
          sourceType: string | null;
          sourcePlatform: string | null;
        }[]
      >()
      .notNull(),
    reason: text('reason').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    profileCreatedIdx: index('idx_social_link_snapshots_profile_created').on(
      table.creatorProfileId,
      table.createdAt
    ),
  })
);

export const insertSecurityEventSchema = createInsertSchema(securityEvents);
export const selectSecurityEventSchema = createSelectSchema(securityEvents);
export const insertSocialLinkSnapshotSchema =
  createInsertSchema(socialLinkSnapshots);
export const selectSocialLinkSnapshotSchema =
  createSelectSchema(socialLinkSnapshots);

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;
export type SocialLinkSnapshot = typeof socialLinkSnapshots.$inferSelect;
export type NewSocialLinkSnapshot = typeof socialLinkSnapshots.$inferInsert;
export type SocialLinkSnapshotEntry =
  (typeof socialLinkSnapshots.$inferSelect.links)[number];
