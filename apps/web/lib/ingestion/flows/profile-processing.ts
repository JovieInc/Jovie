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
import { creatorContacts } from '@/lib/db/schema';
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
}

/**
 * Result of profile extraction processing
 */
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
  }

  // Mark ingestion as idle or failed based on merge result
  await IngestionStatusManager.markIdleOrFailed(tx, profile.id, mergeError);

  // Calculate fit score for the profile
  try {
    if (typeof extraction.hasPaidTier === 'boolean') {
      await updatePaidTierScore(tx, profile.id, extraction.hasPaidTier);
    }
    await calculateAndStoreFitScore(tx, profile.id);
  } catch (fitScoreError) {
    logger.warn('Fit score calculation failed', {
      profileId: profile.id,
      error:
        fitScoreError instanceof Error
          ? fitScoreError.message
          : 'Unknown error',
    });
  }

  // Store extracted contact email if found
  if (extraction.contactEmail) {
    try {
      await storeContactEmail(tx, profile.id, extraction.contactEmail);
    } catch (contactError) {
      logger.warn('Contact email storage failed', {
        profileId: profile.id,
        error:
          contactError instanceof Error
            ? contactError.message
            : 'Unknown error',
      });
    }
  }

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
