import { and, eq, inArray, lte } from 'drizzle-orm';
import { creatorProfiles, type DbType } from '@/lib/db';
import { logger } from '@/lib/utils/logger';

/**
 * Valid ingestion status values
 */
export type IngestionStatus = 'idle' | 'pending' | 'processing' | 'failed';

/**
 * IngestionStatusManager provides centralized management of creator profile
 * ingestion status transitions.
 *
 * Previously, status updates were scattered across 8+ locations in 3 files:
 * - processor.ts (14 locations)
 * - creator-ingest/route.ts (4 locations)
 * - creator-ingest/rerun/route.ts (1 location)
 * - admin/actions.ts (1 location)
 *
 * This service centralizes all status transitions with:
 * - Consistent logging
 * - Automatic updatedAt handling
 * - Type-safe status values
 * - Clear method names for each transition type
 */
export const IngestionStatusManager = {
  /**
   * Mark a profile as processing (ingestion has started)
   */
  async markProcessing(tx: DbType, profileId: string): Promise<void> {
    logger.debug('Ingestion status: processing', { profileId });
    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'processing', updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profileId));
  },

  /**
   * Mark a profile as idle (ingestion completed successfully)
   */
  async markIdle(tx: DbType, profileId: string): Promise<void> {
    logger.debug('Ingestion status: idle', { profileId });
    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'idle', updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profileId));
  },

  /**
   * Mark a profile as failed with an error message
   */
  async markFailed(
    tx: DbType,
    profileId: string,
    errorMessage: string
  ): Promise<void> {
    logger.warn('Ingestion status: failed', { profileId, error: errorMessage });
    await tx
      .update(creatorProfiles)
      .set({
        ingestionStatus: 'failed',
        lastIngestionError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));
  },

  /**
   * Mark a profile as pending (queued for ingestion)
   */
  async markPending(tx: DbType, profileId: string): Promise<void> {
    logger.debug('Ingestion status: pending', { profileId });
    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'pending', updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profileId));
  },

  /**
   * Mark multiple profiles as pending (bulk operation)
   */
  async markPendingBulk(tx: DbType, profileIds: string[]): Promise<void> {
    if (profileIds.length === 0) return;
    logger.debug('Ingestion status: pending (bulk)', {
      count: profileIds.length,
    });
    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'pending', updatedAt: new Date() })
      .where(inArray(creatorProfiles.id, profileIds));
  },

  /**
   * Mark a profile as idle or failed based on whether an error occurred
   */
  async markIdleOrFailed(
    tx: DbType,
    profileId: string,
    error: string | null
  ): Promise<void> {
    if (error) {
      await this.markFailed(tx, profileId, error);
    } else {
      await this.markIdle(tx, profileId);
    }
  },

  /**
   * Handle job failure with retry logic
   * Only marks as failed if shouldRetry is false
   */
  async handleJobFailure(
    tx: DbType,
    profileId: string,
    shouldRetry: boolean,
    errorMessage: string
  ): Promise<void> {
    if (shouldRetry) {
      // Update error message but keep status (job will be retried)
      logger.debug('Ingestion error (will retry)', {
        profileId,
        error: errorMessage,
      });
      await tx
        .update(creatorProfiles)
        .set({
          lastIngestionError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profileId));
    } else {
      // Max attempts exceeded, mark as failed
      await this.markFailed(tx, profileId, errorMessage);
    }
  },

  /**
   * Handle stuck jobs by resetting them to idle
   * Only affects profiles that are in 'processing' state and haven't been
   * updated within the timeout period
   *
   * Uses a single batch UPDATE query instead of sequential updates
   * for better performance.
   */
  async handleStuckJobs(
    tx: DbType,
    profileIds: string[],
    stuckBefore: Date,
    errorMessage: string = 'Processing timeout; requeued'
  ): Promise<void> {
    if (profileIds.length === 0) return;

    logger.warn('Ingestion status: resetting stuck jobs (batch)', {
      count: profileIds.length,
      profileIds,
    });

    // Single batch update instead of sequential updates for O(1) round-trips
    await tx
      .update(creatorProfiles)
      .set({
        ingestionStatus: 'idle',
        lastIngestionError: errorMessage,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(creatorProfiles.id, profileIds),
          eq(creatorProfiles.ingestionStatus, 'processing'),
          lte(creatorProfiles.updatedAt, stuckBefore)
        )
      );
  },
};
