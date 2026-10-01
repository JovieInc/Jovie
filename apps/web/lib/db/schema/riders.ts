import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  RIDER_VISIBILITIES,
  type RiderSection,
  type RiderVisibility,
} from '@/lib/rider/types';
import { creatorProfiles } from './profiles';

export { RIDER_VISIBILITIES, type RiderSection, type RiderVisibility };

/** One-to-one rider. `passwordHash` is a scrypt digest — never serialize it. */
export const creatorProfileRiders = pgTable(
  'creator_profile_riders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    technical: jsonb('technical').$type<RiderSection[]>().notNull().default([]),
    hospitality: jsonb('hospitality')
      .$type<RiderSection[]>()
      .notNull()
      .default([]),
    visibility: text('visibility')
      .$type<RiderVisibility>()
      .notNull()
      .default('private'),
    passwordHash: text('password_hash'),
    // Monotonic CAS token mirroring creatorProfiles.profileEditVersion.
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileUnique: uniqueIndex(
      'creator_profile_riders_profile_unique'
    ).on(table.creatorProfileId),
  })
);

export type CreatorProfileRider = typeof creatorProfileRiders.$inferSelect;
export type NewCreatorProfileRider = typeof creatorProfileRiders.$inferInsert;
