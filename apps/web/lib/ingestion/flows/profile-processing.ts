/**
 * Profile Processing Flow
 *
 * Handles the shared logic for processing profile extractions:
 * merging links, enqueueing follow-up jobs, and calculating fit scores.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { eq } from 'drizzle-orm';

import type { DbOrTransaction } from '@/lib/db';
import type { DiscoveredPixels } from '@/lib/db/schema/profiles';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  calculateAndStoreFitScore,
  updatePaidTierScore,
} from '@/lib/fit-scoring';
import {
  enqueueFollowupIngestionJobs,
  normalizeAndMergeExtraction,
} from '@/lib/ingestion/processor';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import { logger } from '@/lib/utils/logger';

/**
 * Profile data required for extraction processing
 */
export interface ProfileForExtraction {
  id: string;
  usernameNormalized: string;
  avatarUrl: string | null;
  displayName: string | null;
  avatarLockedByUser: boolean;
  displayNameLocked: boolean;
}

/**
 * Extraction data to process
 */
export interface ExtractionData {
  links: Array<{ url: string; platformId?: string; title?: string }>;
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  avatarUrl?: string | null;
  hasPaidTier?: boolean | null;
  displayName?: string | null;
  /** Contact email extracted from bio or content */
  contactEmail?: string | null;
  /** Bio/description text from the profile */
  bio?: string | null;
  /** Tracking pixels detected on the profile page */
  discoveredPixels?: DiscoveredPixels | null;
}

/**
 * Result of profile extraction processing
 */
async function runPostMergeEnrichment(
  tx: DbOrTransaction,
  profileId: string,
  extraction: ExtractionData
): Promise<void> {
  if (extraction.discoveredPixels) {
    try {
      await storeDiscoveredPixels(tx, profileId, extraction.discoveredPixels);
    } catch (pixelError) {
      logger.warn('Discovered pixels storage failed', {
        profileId,
        error:
          pixelError instanceof Error ? pixelError.message : 'Unknown error',
      });
    }
  }

  try {
    if (typeof extraction.hasPaidTier === 'boolean') {
      await updatePaidTierScore(tx, profileId, extraction.hasPaidTier);
    }
    await calculateAndStoreFitScore(tx, profileId);
  } catch (fitScoreError) {
    logger.warn('Fit score calculation failed', {
      profileId,
      error:
        fitScoreError instanceof Error
          ? fitScoreError.message
          : 'Unknown error',
    });
  }

  if (extraction.contactEmail) {
    try {
      await storeContactEmail(tx, profileId, extraction.contactEmail);
    } catch (contactError) {
      logger.warn('Contact email storage failed', {
        profileId,
        error:
          contactError instanceof Error
            ? contactError.message
            : 'Unknown error',
      });
    }
  }
}

export interface ProcessingResult {
  mergeError: string | null;
}

/**
 * Process profile extraction: merge links, enqueue follow-up jobs, and calculate fit score.
 *
 * This consolidates the shared logic used in both re-ingest and new profile flows.
 * Handles errors gracefully and ensures ingestion status is marked appropriately.
 *
 * @param tx - Database transaction
 * @param profile - Profile information for merging
 * @param extraction - Extracted profile data with links and metadata
 * @param displayName - Display name to use if not locked
 * @returns Object with mergeError if link processing failed
 */
export async function processProfileExtraction(
  tx: DbOrTransaction,
  profile: ProfileForExtraction,
  extraction: ExtractionData,
  displayName: string | null
): Promise<ProcessingResult> {
  let mergeError: string | null = null;

  // Merge extracted links into profile
  try {
    await normalizeAndMergeExtraction(
      tx,
      {
        id: profile.id,
        usernameNormalized: profile.usernameNormalized,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName ?? displayName,
        avatarLockedByUser: profile.avatarLockedByUser,
        displayNameLocked: profile.displayNameLocked,
      },
      extraction
    );

    // Enqueue follow-up ingestion jobs for discovered links
    await enqueueFollowupIngestionJobs({
      tx,
      creatorProfileId: profile.id,
      currentDepth: 0,
      extraction,
    });
  } catch (error) {
    mergeError =
      error instanceof Error ? error.message : 'Link extraction failed';
    logger.error('Link merge failed', {
      profileId: profile.id,
      error: mergeError,
    });
    await captureError('Link merge failed during profile processing', error, {
      profileId: profile.id,
      linkCount: extraction.links.length,
    });
  }

  // Mark ingestion as idle or failed based on merge result
  await IngestionStatusManager.markIdleOrFailed(tx, profile.id, mergeError);

  // Run post-merge enrichment steps (pixels, fit score, contact email)
  await runPostMergeEnrichment(tx, profile.id, extraction);

  return { mergeError };
}

/**
 * Store an extracted contact email for a profile.
 * Creates a new contact record if one doesn't exist.
 */
async function storeContactEmail(
  tx: DbOrTransaction,
  profileId: string,
  email: string
): Promise<void> {
  // Check if we already have a contact with this email
  const [existingContact] = await tx
    .select({ id: creatorContacts.id })
    .from(creatorContacts)
    .where(eq(creatorContacts.creatorProfileId, profileId))
    .limit(1);

  if (existingContact) {
    // Update existing contact with email if it doesn't have one
    await tx
      .update(creatorContacts)
      .set({
        email,
        updatedAt: new Date(),
      })
      .where(eq(creatorContacts.id, existingContact.id));

    logger.info('Updated contact with extracted email', {
      profileId,
      contactId: existingContact.id,
    });
  } else {
    // Create new contact
    await tx.insert(creatorContacts).values({
      creatorProfileId: profileId,
      email,
      role: 'fan_general', // Default role for extracted contacts
      isActive: true,
      sortOrder: 0,
    });

    logger.info('Created contact from extracted email', {
      profileId,
    });
  }
}

/**
 * Store discovered tracking pixels for a profile with merge semantics.
 *
 * Merge rules:
 * - If new detection has data for a platform → overwrite that platform's entry
 * - If new detection has no data for a platform → keep existing entry
 * - Never clear existing data with a null detection (handled by caller)
 */
async function storeDiscoveredPixels(
  tx: DbOrTransaction,
  profileId: string,
  incoming: DiscoveredPixels
): Promise<void> {
  // Fetch existing discovered pixels for merge
  const [existing] = await tx
    .select({ discoveredPixels: creatorProfiles.discoveredPixels })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  const existingPixels = existing?.discoveredPixels as DiscoveredPixels | null;

  // Merge: incoming platforms overwrite, existing platforms are preserved
  const merged: DiscoveredPixels = {
    ...existingPixels,
    ...incoming,
  };

  await tx
    .update(creatorProfiles)
    .set({
      discoveredPixels: merged,
      discoveredPixelsAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));

  const platformCount = Object.keys(merged).length;
  logger.info('Stored discovered tracking pixels', {
    profileId,
    platformCount,
    platforms: Object.keys(merged),
  });
}
