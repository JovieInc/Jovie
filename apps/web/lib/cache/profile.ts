'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { invalidateProfileEdgeCache } from '@/lib/services/profile/queries';
import {
  CACHE_TAGS,
  createAvatarTag,
  createProfileTag,
  createSocialLinksTag,
} from './tags';

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
  // Invalidate dashboard data cache (tag-based — no full page refresh)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

  // Invalidate the public profile page for the current username
  if (usernameNormalized) {
    revalidatePath(`/${usernameNormalized}`);
    revalidateTag(createProfileTag(usernameNormalized), 'max');
    // Invalidate Redis edge cache
    await invalidateProfileEdgeCache(usernameNormalized);
  }

  // If username changed, also invalidate the old path
  if (oldUsernameNormalized && oldUsernameNormalized !== usernameNormalized) {
    revalidateTag(createProfileTag(oldUsernameNormalized), 'max');
    revalidatePath(`/${oldUsernameNormalized}`);
    // Invalidate Redis edge cache for old username
    await invalidateProfileEdgeCache(oldUsernameNormalized);
  }

  // NOTE: We intentionally do NOT call revalidatePath on dashboard/settings
  // pages here. revalidatePath triggers a full server re-render which causes
  // a visible full-page refresh. The dashboard uses TanStack Query for data
  // fetching, which handles refetching via its own cache invalidation.
  // The revalidateTag('dashboard-data') above is sufficient.
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
  revalidatePath('/');
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
  revalidateTag(socialLinksTag, 'max');

  // Social links affect the public profile display
  if (usernameNormalized) {
    revalidateTag(createProfileTag(usernameNormalized), 'max');
    revalidatePath(`/${usernameNormalized}`);
  }

  // Invalidate dashboard data cache (tag-only, no full page refresh)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
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
  revalidateTag(avatarTag, 'max');

  // Avatar affects public profile display
  if (usernameNormalized) {
    revalidateTag(createProfileTag(usernameNormalized), 'max');
    revalidatePath(`/${usernameNormalized}`);
  }

  // Invalidate dashboard data cache (tag-only, no full page refresh)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
}
