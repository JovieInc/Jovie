'use server';

import { revalidatePath, revalidateTag, updateTag } from 'next/cache';

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
  updateTag('dashboard-data');
  revalidateTag('dashboard-data', 'max');

  // Invalidate the public profile page for the current username
  if (usernameNormalized) {
    revalidatePath(`/${usernameNormalized}`);
  }

  if (usernameNormalized) {
    updateTag('public-profile');
    updateTag(`public-profile:${usernameNormalized}`);
    revalidateTag('public-profile', 'max');
    revalidateTag(`public-profile:${usernameNormalized}`, 'max');
  }

  // If username changed, also invalidate the old path
  if (oldUsernameNormalized && oldUsernameNormalized !== usernameNormalized) {
    updateTag(`public-profile:${oldUsernameNormalized}`);
    revalidateTag(`public-profile:${oldUsernameNormalized}`, 'max');
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
