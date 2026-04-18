import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  catalogMismatchStatusEnum,
  catalogMismatchTypeEnum,
  catalogScanStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// ============================================================================
// DSP Catalog Scans - Scan runs for catalog mismatch detection
// ============================================================================

export const dspCatalogScans = pgTable(
  'dsp_catalog_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // e.g., 'spotify'
    externalArtistId: text('external_artist_id').notNull(),
    status: catalogScanStatusEnum('status').notNull().default('pending'),
    catalogIsrcCount: integer('catalog_isrc_count').notNull().default(0),
    dspIsrcCount: integer('dsp_isrc_count').notNull().default(0),
    matchedCount: integer('matched_count').notNull().default(0),
    unmatchedCount: integer('unmatched_count').notNull().default(0),
    missingCount: integer('missing_count').notNull().default(0),
    coveragePct: decimal('coverage_pct', { precision: 5, scale: 2 }),
    albumsScanned: integer('albums_scanned').notNull().default(0),
    tracksScanned: integer('tracks_scanned').notNull().default(0),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('dsp_catalog_scans_creator_idx').on(table.creatorProfileId),
    index('dsp_catalog_scans_status_idx').on(table.status, table.createdAt),
  ]
);

export type DspCatalogScan = typeof dspCatalogScans.$inferSelect;
export type NewDspCatalogScan = typeof dspCatalogScans.$inferInsert;
export const insertDspCatalogScanSchema = createInsertSchema(dspCatalogScans);
export const selectDspCatalogScanSchema = createSelectSchema(dspCatalogScans);

// ============================================================================
// DSP Catalog Mismatches - Individual flagged items from a scan
// ============================================================================

export const dspCatalogMismatches = pgTable(
  'dsp_catalog_mismatches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => dspCatalogScans.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    isrc: text('isrc').notNull(),
    mismatchType: catalogMismatchTypeEnum('mismatch_type').notNull(),
    externalTrackId: text('external_track_id'),
    externalTrackName: text('external_track_name'),
    externalAlbumName: text('external_album_name'),
    externalAlbumId: text('external_album_id'),
    externalArtworkUrl: text('external_artwork_url'),
    externalArtistNames: text('external_artist_names'),
    status: catalogMismatchStatusEnum('status').notNull().default('flagged'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedReason: text('dismissed_reason'),
    dedupKey: text('dedup_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('dsp_catalog_mismatches_dedup_idx').on(table.dedupKey),
    index('dsp_catalog_mismatches_creator_idx').on(table.creatorProfileId),
    index('dsp_catalog_mismatches_scan_idx').on(table.scanId),
    index('dsp_catalog_mismatches_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
  ]
);

export type DspCatalogMismatch = typeof dspCatalogMismatches.$inferSelect;
export type NewDspCatalogMismatch = typeof dspCatalogMismatches.$inferInsert;
export const insertDspCatalogMismatchSchema =
  createInsertSchema(dspCatalogMismatches);
export const selectDspCatalogMismatchSchema =
  createSelectSchema(dspCatalogMismatches);
