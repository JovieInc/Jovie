'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { invalidateProfileEdgeCache } from '@/lib/services/profile/queries';
import { logger } from '@/lib/utils/logger';
import {
  CACHE_TAGS,
  createAvatarTag,
  createProfileTag,
  createSocialLinksTag,
} from './tags';

function isMissingStaticGenerationStoreError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('static generation store missing')
  );
}

function safeRevalidateTag(tag: string) {
  try {
    revalidateTag(tag, 'max');
  } catch (error) {
    if (!isMissingStaticGenerationStoreError(error)) {
      throw error;
    }

    logger.warn('Skipping tag revalidation outside Next cache context', {
      tag,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    if (!isMissingStaticGenerationStoreError(error)) {
      throw error;
    }

    logger.warn('Skipping path revalidation outside Next cache context', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Centralized cache invalidation for creator profiles.
 * Call this after any profile mutation to ensure all caches are cleared.
 *
 * @param usernameNormalized - The normalized username (lowercase) of the profile
 * @param oldUsernameNormalized - Optional old username if it changed (to invalidate old path)
 */
export async function invalidateProfileCache(
  usernameNormalized: string | null | undefined,
  oldUsernameNormalized?: string | null
): Promise<void> {
  // Invalidate dashboard data cache
  safeRevalidateTag(CACHE_TAGS.DASHBOARD_DATA);

  // Invalidate the public profile page for the current username
  if (usernameNormalized) {
    safeRevalidatePath(`/${usernameNormalized}`);
    // Invalidate Redis edge cache
    await invalidateProfileEdgeCache(usernameNormalized);
  }

  if (usernameNormalized) {
    safeRevalidateTag(createProfileTag(usernameNormalized));
  }

  // If username changed, also invalidate the old path
  if (oldUsernameNormalized && oldUsernameNormalized !== usernameNormalized) {
    safeRevalidateTag(createProfileTag(oldUsernameNormalized));
    safeRevalidatePath(`/${oldUsernameNormalized}`);
    // Invalidate Redis edge cache for old username
    await invalidateProfileEdgeCache(oldUsernameNormalized);
  }

  // Invalidate dashboard pages that display profile data
  safeRevalidatePath(APP_ROUTES.DASHBOARD);
  safeRevalidatePath(APP_ROUTES.CHAT);
  safeRevalidatePath(APP_ROUTES.SETTINGS);
}

/**
 * Invalidate all profile-related caches after a username change.
 * This is more aggressive and should be used when the username itself changes.
 */
export async function invalidateUsernameChange(
  newUsernameNormalized: string,
  oldUsernameNormalized: string | null | undefined
): Promise<void> {
  await invalidateProfileCache(newUsernameNormalized, oldUsernameNormalized);

  // Also invalidate homepage in case featured creators are affected
  safeRevalidatePath('/');
}

/**
 * Invalidate caches when social links are modified.
 * Call this after creating, updating, or deleting social links.
 *
 * @param profileId - The profile UUID
 * @param usernameNormalized - The normalized username for the profile
 */
export async function invalidateSocialLinksCache(
  profileId: string,
  usernameNormalized: string | null | undefined
): Promise<void> {
  // Invalidate the social links specific cache
  const socialLinksTag = createSocialLinksTag(profileId);
  safeRevalidateTag(socialLinksTag);

  // Social links affect the public profile display
  if (usernameNormalized) {
    safeRevalidateTag(createProfileTag(usernameNormalized));
    safeRevalidatePath(`/${usernameNormalized}`);
  }

  // Also invalidate dashboard where links are managed
  safeRevalidateTag(CACHE_TAGS.DASHBOARD_DATA);
  safeRevalidatePath(APP_ROUTES.DASHBOARD);
  safeRevalidatePath(APP_ROUTES.CHAT);
}

/**
 * Invalidate caches when a user's avatar is uploaded or changed.
 * Call this after successful avatar upload.
 *
 * @param userId - The user's internal UUID or clerk ID
 * @param usernameNormalized - The normalized username for the profile (if available)
 */
export async function invalidateAvatarCache(
  userId: string,
  usernameNormalized?: string | null
): Promise<void> {
  // Invalidate avatar-specific cache
  const avatarTag = createAvatarTag(userId);
  safeRevalidateTag(avatarTag);

  // Avatar affects public profile display
  if (usernameNormalized) {
    safeRevalidateTag(createProfileTag(usernameNormalized));
    safeRevalidatePath(`/${usernameNormalized}`);
  }

  // Dashboard also shows avatar
  safeRevalidateTag(CACHE_TAGS.DASHBOARD_DATA);
  safeRevalidatePath(APP_ROUTES.DASHBOARD);
  safeRevalidatePath(APP_ROUTES.CHAT);
  safeRevalidatePath(APP_ROUTES.SETTINGS);
}
