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
 * - Avatar is not locked by user
 * - Profile has a username
 * - Profile doesn't already have a blob-hosted avatar (prevents orphaned blobs)
 *
 * Profiles with external DSP URLs (not yet copied to blob) will still be
 * copied. Profiles already hosted on blob storage skip re-upload to avoid
 * accumulating orphaned blobs (each upload creates a new UUID path).
 *
 * @param profile - Profile context
 * @param extractionAvatarUrl - Avatar URL from extraction
 * @returns True if avatar should be copied
 */
export function shouldCopyAvatar(
  profile: AvatarProcessingContext,
  extractionAvatarUrl: string | null
): boolean {
  if (
    !extractionAvatarUrl ||
    profile.avatarLockedByUser ||
    !profile.usernameNormalized
  ) {
    return false;
  }

  // Skip if already hosted on blob storage to prevent orphaned blobs.
  // Each copyExternalAvatarToStorage call creates a new UUID-based path,
  // so re-uploading the same image would orphan the old blob.
  if (profile.avatarUrl?.includes('blob.vercel-storage.com')) {
    return false;
  }

  return true;
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
