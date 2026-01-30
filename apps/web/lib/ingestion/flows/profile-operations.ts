/**
 * Profile Operations
 *
 * Common profile operations used across ingestion flows.
 */

import { eq, inArray } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import { isValidHandle } from '@/lib/ingestion/strategies/linktree';

/**
 * Result of checking for an existing profile.
 */
export interface ExistingProfileCheck {
  existing: {
    id: string;
    isClaimed: boolean | null;
    usernameNormalized: string;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean;
    displayNameLocked: boolean;
    claimToken: string | null;
    claimTokenExpiresAt: Date | null;
  } | null;
  isReingest: boolean;
  finalHandle: string | null;
}

/**
 * Finds an available handle by trying suffixes (-1, -2, etc.).
 *
 * Uses a single batch query to check all candidate handles at once,
 * reducing database round-trips from up to 20 to just 1.
 *
 * @param tx - Database transaction
 * @param baseHandle - Base handle to start from
 * @returns Available handle, or null if all attempts exhausted
 */
export async function findAvailableHandle(
  tx: DbOrTransaction,
  baseHandle: string
): Promise<string | null> {
  const MAX_LEN = 30;
  const normalizedBase = baseHandle.slice(0, MAX_LEN);
  const maxAttempts = 20;

  // Generate all candidate handles upfront
  const candidates: string[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = i === 0 ? '' : `-${i}`;
    const trimmedBase = normalizedBase.slice(0, MAX_LEN - suffix.length);
    const candidate = `${trimmedBase}${suffix}`;
    if (isValidHandle(candidate)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Single batch query to find all existing handles
  const existingHandles = await tx
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.usernameNormalized, candidates));

  // Convert to Set for O(1) lookup
  const existingSet = new Set(existingHandles.map(h => h.usernameNormalized));

  // Return first available candidate (maintains priority order)
  return candidates.find(c => !existingSet.has(c)) ?? null;
}

/**
 * Checks for an existing profile and determines final handle.
 *
 * @param usernameNormalized - Normalized username to check
 * @returns Existing profile check result
 */
export async function checkExistingProfile(
  usernameNormalized: string
): Promise<ExistingProfileCheck> {
  return withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
        avatarUrl: creatorProfiles.avatarUrl,
        displayName: creatorProfiles.displayName,
        avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        displayNameLocked: creatorProfiles.displayNameLocked,
        claimToken: creatorProfiles.claimToken,
        claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
      .limit(1);

    const isReingest = !!existing && !existing.isClaimed;

    let finalHandle: string | null;
    if (!existing) {
      finalHandle = usernameNormalized;
    } else if (existing.isClaimed) {
      finalHandle = await findAvailableHandle(tx, usernameNormalized);
    } else {
      finalHandle = existing.usernameNormalized;
    }

    if (isReingest && existing) {
      await IngestionStatusManager.markProcessing(tx, existing.id);
    }

    return { existing, isReingest, finalHandle };
  });
}

/**
 * Marks a reingest as failed if applicable.
 *
 * @param existingCheck - Result from checkExistingProfile
 * @param errorMessage - Error message to record
 */
export async function markReingestFailure(
  existingCheck: ExistingProfileCheck,
  errorMessage: string
): Promise<void> {
  if (!existingCheck.isReingest || !existingCheck.existing) {
    return;
  }

  await withSystemIngestionSession(async tx => {
    await IngestionStatusManager.markIdleOrFailed(
      tx,
      existingCheck.existing!.id,
      errorMessage
    );
  });
}
