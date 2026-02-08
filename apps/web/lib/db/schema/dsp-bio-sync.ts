import { sql as drizzleSql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { dspBioSyncMethodEnum, dspBioSyncStatusEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Metadata stored alongside each bio sync request.
 */
export interface DspBioSyncMetadata {
  /** Resend message ID for email-based syncs */
  providerMessageId?: string;
  /** DSP support email the request was sent to */
  sentToEmail?: string;
  /** API endpoint used for API-based syncs */
  apiEndpoint?: string;
  /** HTTP status code from API response */
  apiStatusCode?: number;
  /** Error details if the sync failed */
  errorDetail?: string;
  /** The bio text that was sent in this request */
  bioSnapshot?: string;
}

// ============================================================================
// DSP Bio Sync Requests - Track bio update pushes to DSPs
// ============================================================================

export const dspBioSyncRequests = pgTable(
  'dsp_bio_sync_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    /** DSP provider ID (e.g., 'spotify', 'apple_music', 'tidal') */
    providerId: text('provider_id').notNull(),
    /** How this sync was attempted */
    method: dspBioSyncMethodEnum('method').notNull(),
    /** Current status of the sync request */
    status: dspBioSyncStatusEnum('status').default('pending').notNull(),
    /** The bio text submitted in this request */
    bioText: text('bio_text').notNull(),
    /** Error message if the sync failed */
    error: text('error'),
    /** When the sync was actually sent (email dispatched or API called) */
    sentAt: timestamp('sent_at'),
    /** Additional metadata (message IDs, API responses, etc.) */
    metadata: jsonb('metadata').$type<DspBioSyncMetadata>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Find latest sync per creator + provider
    creatorProviderIdx: index('dsp_bio_sync_requests_creator_provider_idx').on(
      table.creatorProfileId,
      table.providerId,
      table.createdAt
    ),
    // Find pending/sending requests for processing
    statusIdx: index('dsp_bio_sync_requests_status_idx')
      .on(table.status, table.createdAt)
      .where(drizzleSql`status IN ('pending', 'sending')`),
  })
);

// ============================================================================
// Schema Validations
// ============================================================================

export const insertDspBioSyncRequestSchema =
  createInsertSchema(dspBioSyncRequests);
export const selectDspBioSyncRequestSchema =
  createSelectSchema(dspBioSyncRequests);

// ============================================================================
// Types
// ============================================================================

export type DspBioSyncRequest = typeof dspBioSyncRequests.$inferSelect;
export type NewDspBioSyncRequest = typeof dspBioSyncRequests.$inferInsert;
