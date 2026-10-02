import { sql as drizzleSql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/** One DSP destination stored on an unclaimed Jovie link. */
export interface SmartLinkProviderRow {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

/**
 * Unclaimed public Jovie links created without a profile.
 * `/s/{code}` stays the audience redirect, which requires a creator profile.
 * These rows render at `/l/{code}`.
 */
export const smartLinks = pgTable(
  'smart_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    query: text('query').notNull(),
    kind: text('kind').notNull(),
    title: text('title'),
    artistName: text('artist_name'),
    artworkUrl: text('artwork_url'),
    providers: jsonb('providers')
      .$type<SmartLinkProviderRow[]>()
      .notNull()
      .default([]),
    isrc: text('isrc'),
    upc: text('upc'),
    providerKey: text('provider_key'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** sha256 of the anonymous IP. Not a raw address. */
    anonymousSubjectHash: text('anonymous_subject_hash'),
    clickCount: integer('click_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    codeUnique: uniqueIndex('smart_links_code_unique').on(table.code),
    isrcUnique: uniqueIndex('smart_links_isrc_unique')
      .on(table.isrc)
      .where(drizzleSql`isrc IS NOT NULL`),
    providerKeyUnique: uniqueIndex('smart_links_provider_key_unique')
      .on(table.providerKey)
      .where(drizzleSql`provider_key IS NOT NULL`),
    anonymousCreatedIdx: index('smart_links_anonymous_created_idx').on(
      table.anonymousSubjectHash,
      table.createdAt
    ),
  })
);

export type SmartLink = typeof smartLinks.$inferSelect;
export type NewSmartLink = typeof smartLinks.$inferInsert;
