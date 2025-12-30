'use server';

import { revalidatePath, revalidateTag, updateTag } from 'next/cache';

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
  // Invalidate dashboard data cache
  updateTag(CACHE_TAGS.DASHBOARD_DATA);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

  // Invalidate the public profile page for the current username
  if (usernameNormalized) {
    revalidatePath(`/${usernameNormalized}`);
  }

  if (usernameNormalized) {
    updateTag(CACHE_TAGS.PUBLIC_PROFILE);
    updateTag(createProfileTag(usernameNormalized));
    revalidateTag(CACHE_TAGS.PUBLIC_PROFILE, 'max');
    revalidateTag(createProfileTag(usernameNormalized), 'max');
  }

  // If username changed, also invalidate the old path
  if (oldUsernameNormalized && oldUsernameNormalized !== usernameNormalized) {
    updateTag(createProfileTag(oldUsernameNormalized));
    revalidateTag(createProfileTag(oldUsernameNormalized), 'max');
    revalidatePath(`/${oldUsernameNormalized}`);
  }

  // Invalidate dashboard pages that display profile data
  revalidatePath('/app/dashboard');
  revalidatePath('/app/dashboard/overview');
  revalidatePath('/app/settings');
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
  updateTag(socialLinksTag);
  revalidateTag(socialLinksTag, 'max');

  // Social links affect the public profile display
  if (usernameNormalized) {
    updateTag(CACHE_TAGS.PUBLIC_PROFILE);
    updateTag(createProfileTag(usernameNormalized));
    revalidateTag(CACHE_TAGS.PUBLIC_PROFILE, 'max');
    revalidateTag(createProfileTag(usernameNormalized), 'max');
    revalidatePath(`/${usernameNormalized}`);
  }

  // Also invalidate dashboard where links are managed
  updateTag(CACHE_TAGS.DASHBOARD_DATA);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
  revalidatePath('/app/dashboard');
  revalidatePath('/app/dashboard/links');
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
  updateTag(avatarTag);
  revalidateTag(avatarTag, 'max');

  // Avatar affects public profile display
  if (usernameNormalized) {
    updateTag(CACHE_TAGS.PUBLIC_PROFILE);
    updateTag(createProfileTag(usernameNormalized));
    revalidateTag(CACHE_TAGS.PUBLIC_PROFILE, 'max');
    revalidateTag(createProfileTag(usernameNormalized), 'max');
    revalidatePath(`/${usernameNormalized}`);
  }

  // Dashboard also shows avatar
  updateTag(CACHE_TAGS.DASHBOARD_DATA);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
  revalidatePath('/app/dashboard');
  revalidatePath('/app/dashboard/overview');
  revalidatePath('/app/settings');
}
