import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Shared enums used across multiple domain modules.
 * These are extracted to avoid circular dependencies between domain files.
 */

/**
 * Ingestion status for creator profiles.
 * Tracks the state of automated data ingestion processes.
 */
export const ingestionStatusEnum = pgEnum('ingestion_status', [
  'idle',
  'pending',
  'processing',
  'failed',
]);

/**
 * Source type for data that can be manually entered, admin-added, or auto-ingested.
 * Used across: discogReleases, discogTracks, providerLinks, socialLinks, socialAccounts, profilePhotos
 */
export const ingestionSourceTypeEnum = pgEnum('ingestion_source_type', [
  'manual',
  'admin',
  'ingested',
]);
