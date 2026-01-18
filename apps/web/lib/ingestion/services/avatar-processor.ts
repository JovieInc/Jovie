/**
 * Avatar Processor Service
 *
 * Handles avatar copying from external sources to Jovie storage.
 */

import { copyExternalAvatarToStorage } from '../magic-profile-avatar';

/**
 * Profile information needed for avatar processing.
 */
export interface AvatarProcessingContext {
  avatarUrl: string | null;
  avatarLockedByUser: boolean | null;
  usernameNormalized: string | null;
}

/**
 * Determines if avatar should be copied from extraction.
 * Avatar is copied only if:
 * - Extraction has an avatar URL
 * - Profile doesn't have an avatar yet
 * - Avatar is not locked by user
 * - Profile has a username
 *
 * @param profile - Profile context
 * @param extractionAvatarUrl - Avatar URL from extraction
 * @returns True if avatar should be copied
 */
export function shouldCopyAvatar(
  profile: AvatarProcessingContext,
  extractionAvatarUrl: string | null
): boolean {
  return !!(
    extractionAvatarUrl &&
    !profile.avatarUrl &&
    !profile.avatarLockedByUser &&
    profile.usernameNormalized
  );
}

/**
 * Copies external avatar to Jovie storage if conditions are met.
 * Returns null if avatar should not be copied or if copy fails.
 *
 * @param profile - Profile context
 * @param extractionAvatarUrl - Avatar URL from extraction
 * @returns Hosted avatar URL or null
 */
export async function processAvatarIfNeeded(
  profile: AvatarProcessingContext,
  extractionAvatarUrl: string | null
): Promise<string | null> {
  if (!shouldCopyAvatar(profile, extractionAvatarUrl)) {
    return null;
  }

  return await copyExternalAvatarToStorage({
    externalUrl: extractionAvatarUrl!,
    handle: profile.usernameNormalized!,
    sourcePlatform: 'ingestion',
  });
}
