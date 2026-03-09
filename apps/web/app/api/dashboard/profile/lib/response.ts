/**
 * Profile Response Helpers
 *
 * Helper functions for building profile API responses.
 */

import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { invalidateUsernameChange } from '@/lib/cache/profile';
import type { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

export function addAvatarCacheBust(
  updatedProfile: (typeof creatorProfiles)['$inferSelect']
) {
  const responseProfile = { ...updatedProfile };
  if (responseProfile.avatarUrl) {
    const url = new URL(responseProfile.avatarUrl);
    url.searchParams.set('v', Date.now().toString());
    responseProfile.avatarUrl = url.toString();
  }
  return responseProfile;
}

export interface FinalizeProfileResponseParams {
  updatedProfile: (typeof creatorProfiles)['$inferSelect'];
  oldUsernameNormalized: string | null;
  clerkUserId: string;
}

export async function finalizeProfileResponse({
  updatedProfile,
  oldUsernameNormalized,
  clerkUserId,
}: FinalizeProfileResponseParams) {
  await invalidateUsernameChange(
    updatedProfile.usernameNormalized,
    oldUsernameNormalized
  );

  trackServerEvent('dashboard_profile_updated', undefined, clerkUserId).catch(
    error => logger.warn('Analytics tracking failed:', error)
  );
}
