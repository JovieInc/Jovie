/**
 * Profile Operations
 *
 * Common profile operations used across ingestion flows.
 */

import { eq } from 'drizzle-orm';
import type { DbType } from '@/lib/db';
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
 * @param tx - Database transaction
 * @param baseHandle - Base handle to start from
 * @returns Available handle, or null if all attempts exhausted
 */
export async function findAvailableHandle(
  tx: DbType,
  baseHandle: string
): Promise<string | null> {
  const MAX_LEN = 30;
  const normalizedBase = baseHandle.slice(0, MAX_LEN);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix = i === 0 ? '' : `-${i}`;
    const trimmedBase = normalizedBase.slice(0, MAX_LEN - suffix.length);
    const candidate = `${trimmedBase}${suffix}`;
    if (!isValidHandle(candidate)) continue;

    const [existing] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return null;
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
