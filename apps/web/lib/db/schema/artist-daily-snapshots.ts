/**
 * Append-only public metric history for known artists: one row per creator
 * profile, source, and UTC collection day; conflicts on the unique key are a
 * no-op. raw_values holds parsed public counts only; provenance records how
 * the row was fetched. Neither column may store cookies, tokens, or HTML.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { creatorProfiles } from './profiles';

export const ARTIST_DAILY_SNAPSHOT_SOURCES = [
  'youtube',
  'instagram',
  'wikipedia',
] as const;

export type ArtistDailySnapshotSource =
  (typeof ARTIST_DAILY_SNAPSHOT_SOURCES)[number];

export interface ArtistDailySnapshotProvenance {
  method: string;
  publicUrl: string | null;
  httpStatus: number | null;
  robots: 'allowed' | 'disallowed' | 'not_applicable' | 'unavailable';
  userAgent: string;
  /** Always logged-out. Logged-in payloads are refused before insert. */
  access: 'logged_out';
  wikidataQid?: string;
  musicbrainzId?: string;
}

export const artistDailySnapshots = pgTable(
  'artist_daily_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    snapshotDay: date('snapshot_day', { mode: 'string' }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    rawValues: jsonb('raw_values').$type<Record<string, unknown>>().notNull(),
    provenance: jsonb('provenance')
      .$type<ArtistDailySnapshotProvenance>()
      .notNull(),
  },
  table => ({
    artistSourceDayUnique: uniqueIndex(
      'artist_daily_snapshots_artist_source_day_unique'
    ).on(table.creatorProfileId, table.source, table.snapshotDay),
    daySourceIdx: index('artist_daily_snapshots_day_source_idx').on(
      table.snapshotDay,
      table.source
    ),
    sourceCheck: check(
      'artist_daily_snapshots_source_check',
      drizzleSql`${table.source} in ('youtube', 'instagram', 'wikipedia')`
    ),
  })
);

export const insertArtistDailySnapshotSchema =
  createInsertSchema(artistDailySnapshots);
export const selectArtistDailySnapshotSchema =
  createSelectSchema(artistDailySnapshots);

export type ArtistDailySnapshot = typeof artistDailySnapshots.$inferSelect;
export type NewArtistDailySnapshot = typeof artistDailySnapshots.$inferInsert;
