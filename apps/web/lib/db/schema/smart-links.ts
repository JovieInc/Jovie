import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
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

export interface SmartLinkProviderRow {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

/** Unclaimed public links rendered at `/l/{code}`. */
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
    /** sha256 of a fixed prefix and the anonymous caller IP, never the raw IP. */
    anonymousSubjectHash: text('anonymous_subject_hash'),
    /** UTC month and one of three slots make anonymous admission atomic. */
    anonymousMonth: timestamp('anonymous_month', { withTimezone: true }),
    anonymousSlot: integer('anonymous_slot'),
    clickCount: integer('click_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    anonymousMonthIdx: index('smart_links_anonymous_month_idx').on(
      table.anonymousSubjectHash,
      table.anonymousMonth
    ),
    anonymousQuotaShape: check(
      'smart_links_anonymous_quota_shape',
      drizzleSql`(${table.anonymousSubjectHash} IS NULL AND ${table.anonymousMonth} IS NULL AND ${table.anonymousSlot} IS NULL) OR (${table.anonymousSubjectHash} IS NOT NULL AND ${table.anonymousMonth} IS NOT NULL AND ${table.anonymousSlot} BETWEEN 0 AND 2)`
    ),
    anonymousSlotUnique: uniqueIndex('smart_links_anonymous_month_slot_unique')
      .on(table.anonymousSubjectHash, table.anonymousMonth, table.anonymousSlot)
      .where(drizzleSql`${table.anonymousSubjectHash} IS NOT NULL`),
    codeUnique: uniqueIndex('smart_links_code_unique').on(table.code),
    isrcUnique: uniqueIndex('smart_links_isrc_unique')
      .on(table.isrc)
      .where(drizzleSql`${table.isrc} IS NOT NULL`),
    providerKeyUnique: uniqueIndex('smart_links_provider_key_unique')
      .on(table.providerKey)
      .where(drizzleSql`${table.providerKey} IS NOT NULL`),
  })
);

export type SmartLink = typeof smartLinks.$inferSelect;
export type NewSmartLink = typeof smartLinks.$inferInsert;
