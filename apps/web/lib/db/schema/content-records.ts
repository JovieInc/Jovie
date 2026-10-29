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

/**
 * Versioned content records: the one store for content and config that ships
 * as data instead of code (`.claude/rules/data-vs-code.md`). Marketing page
 * specs are the first kind; other kinds register in
 * `lib/content-records/kinds.ts` and reuse these three tables.
 *
 * - `content_record_versions` is append-only. Every draft is a new immutable
 *   version, validated against its kind's schema at write time.
 * - `content_record_live` holds one pointer per (kind, key): the version the
 *   site serves. Publish and rollback only move this pointer.
 * - `content_record_events` is the append-only audit log: one row per publish
 *   or rollback, with actor, reason, and the from/to versions.
 *
 * Readers go through `lib/content-records/store.server.ts`, which caches by
 * tag and falls back to the repo-seeded default when the store is unavailable.
 */
export const contentRecordVersions = pgTable(
  'content_record_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    recordKey: text('record_key').notNull(),
    version: integer('version').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    data: jsonb('data').notNull(),
    author: text('author').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    kindKeyVersion: uniqueIndex(
      'content_record_versions_kind_key_version_uq'
    ).on(table.kind, table.recordKey, table.version),
  })
);

export const contentRecordLive = pgTable(
  'content_record_live',
  {
    kind: text('kind').notNull(),
    recordKey: text('record_key').notNull(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => contentRecordVersions.id),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedBy: text('published_by').notNull(),
  },
  table => ({
    kindKey: uniqueIndex('content_record_live_kind_key_uq').on(
      table.kind,
      table.recordKey
    ),
  })
);

export const contentRecordEvents = pgTable(
  'content_record_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    recordKey: text('record_key').notNull(),
    // 'publish' | 'rollback'
    action: text('action').notNull(),
    fromVersionId: uuid('from_version_id'),
    toVersionId: uuid('to_version_id').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    kindKeyCreated: index('content_record_events_kind_key_created_idx').on(
      table.kind,
      table.recordKey,
      table.createdAt
    ),
  })
);

export type ContentRecordVersionRow = typeof contentRecordVersions.$inferSelect;
export type ContentRecordLiveRow = typeof contentRecordLive.$inferSelect;
export type ContentRecordEventRow = typeof contentRecordEvents.$inferSelect;
