/**
 * Append-only per-song daily signals (catalog-reactivation proof baseline).
 * One row per song (or release, when a signal is release-level) per source per
 * UTC day. Public signals only: Spotify popularity, YouTube view counts, and
 * Jovie's own release click-outs. `values` is a small numeric object.
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
import { discogReleases, discogTracks } from './content';
import { creatorProfiles } from './profiles';

export const TRACK_DAILY_SNAPSHOT_SOURCES = [
  'spotify_popularity',
  'youtube_views',
  'jovie_release',
] as const;
export type TrackDailySnapshotSource =
  (typeof TRACK_DAILY_SNAPSHOT_SOURCES)[number];

export const trackDailySnapshots = pgTable(
  'track_daily_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    /** Null for release-level signals (release click-outs, release videos). */
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    source: text('source').notNull(),
    snapshotDay: date('snapshot_day', { mode: 'string' }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    values: jsonb('values').$type<Record<string, unknown>>().notNull(),
  },
  table => ({
    trackSourceDayUnique: uniqueIndex('track_daily_snapshots_track_source_day')
      .on(table.trackId, table.source, table.snapshotDay)
      .where(drizzleSql`track_id IS NOT NULL`),
    releaseSourceDayUnique: uniqueIndex(
      'track_daily_snapshots_release_source_day'
    )
      .on(table.releaseId, table.source, table.snapshotDay)
      .where(drizzleSql`track_id IS NULL`),
    profileDayIdx: index('track_daily_snapshots_profile_day_idx').on(
      table.creatorProfileId,
      table.snapshotDay
    ),
    sourceCheck: check(
      'track_daily_snapshots_source_check',
      drizzleSql`${table.source} in ('spotify_popularity', 'youtube_views', 'jovie_release')`
    ),
  })
);

export type TrackDailySnapshot = typeof trackDailySnapshots.$inferSelect;
export type NewTrackDailySnapshot = typeof trackDailySnapshots.$inferInsert;
