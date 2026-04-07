import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogReleases } from './content';
import { creatorProfiles } from './profiles';

// Promo download files table — individual downloadable files attached to releases
export const promoDownloads = pgTable(
  'promo_downloads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    /** Vercel Blob pathname (NOT public URL). Download URLs generated server-side. */
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    fileMimeType: text('file_mime_type').notNull(),
    artworkUrl: text('artwork_url'),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseSlugUnique: uniqueIndex('promo_downloads_release_id_slug_unique').on(
      table.releaseId,
      table.slug
    ),
    releaseActivePositionIdx: index(
      'promo_downloads_release_id_is_active_position_idx'
    ).on(table.releaseId, table.isActive, table.position),
  })
);

// Promo download events — tracks each successful download for analytics
export const promoDownloadEvents = pgTable(
  'promo_download_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promoDownloadId: uuid('promo_download_id')
      .notNull()
      .references(() => promoDownloads.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    country: text('country'),
    city: text('city'),
    downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
  },
  table => ({
    promoDownloadDateIdx: index(
      'promo_download_events_promo_download_id_downloaded_at_idx'
    ).on(table.promoDownloadId, table.downloadedAt),
    emailIdx: index('promo_download_events_email_idx').on(table.email),
  })
);

// Zod schemas
export const insertPromoDownloadSchema = createInsertSchema(promoDownloads);
export const selectPromoDownloadSchema = createSelectSchema(promoDownloads);
export const insertPromoDownloadEventSchema =
  createInsertSchema(promoDownloadEvents);
export const selectPromoDownloadEventSchema =
  createSelectSchema(promoDownloadEvents);

// Types
export type PromoDownload = typeof promoDownloads.$inferSelect;
export type NewPromoDownload = typeof promoDownloads.$inferInsert;
export type PromoDownloadEvent = typeof promoDownloadEvents.$inferSelect;
export type NewPromoDownloadEvent = typeof promoDownloadEvents.$inferInsert;
