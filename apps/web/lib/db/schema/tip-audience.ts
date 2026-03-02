import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { creatorProfiles } from './profiles';

// Tip audience source enum
export const tipAudienceSourceEnum = pgEnum('tip_audience_source', [
  'tip',
  'link_click',
  'save',
  'manual',
]);

/**
 * Tip Audience table — tracks fans who have tipped a creator.
 *
 * Deduped by (profile_id, email). Each row accumulates tip totals
 * and tracks marketing opt-in state for the creator's audience.
 */
export const tipAudience = pgTable(
  'tip_audience',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    source: tipAudienceSourceEnum('source').notNull().default('tip'),
    tipAmountTotalCents: integer('tip_amount_total_cents').notNull().default(0),
    tipCount: integer('tip_count').notNull().default(0),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    unsubscribed: boolean('unsubscribed').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profileEmailUnique: uniqueIndex('tip_audience_profile_id_email_unique').on(
      table.profileId,
      table.email
    ),
    profileLastSeenIdx: index('tip_audience_profile_id_last_seen_at_idx').on(
      table.profileId,
      table.lastSeenAt
    ),
    profileCreatedAtIdx: index('tip_audience_profile_id_created_at_idx').on(
      table.profileId,
      table.createdAt
    ),
    emailIdx: index('tip_audience_email_idx')
      .on(table.email)
      .where(drizzleSql`unsubscribed = false`),
  })
);

// Schema validations
export const insertTipAudienceSchema = createInsertSchema(tipAudience);
export const selectTipAudienceSchema = createSelectSchema(tipAudience);

// Types
export type TipAudienceMember = typeof tipAudience.$inferSelect;
export type NewTipAudienceMember = typeof tipAudience.$inferInsert;
