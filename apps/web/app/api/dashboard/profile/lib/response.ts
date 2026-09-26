/**
 * Profile Response Helpers
 *
 * Helper functions for building profile API responses.
 */

import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import {
  invalidateHomepageCache,
  invalidateProfileCache,
  invalidateUsernameChange,
} from '@/lib/cache/profile';
import { invalidateReleaseCaches } from '@/lib/cache/releases';
import type { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

export function addAvatarCacheBust(
  updatedProfile: (typeof creatorProfiles)['$inferSelect']
) {
  const responseProfile = { ...updatedProfile };
  if (responseProfile.avatarUrl) {
    const cacheBustValue = Date.now().toString();
    if (responseProfile.avatarUrl.startsWith('//')) {
      const protocolRelativeUrl = new URL(`https:${responseProfile.avatarUrl}`);
      protocolRelativeUrl.searchParams.set('v', cacheBustValue);
      responseProfile.avatarUrl = `//${protocolRelativeUrl.host}${protocolRelativeUrl.pathname}${protocolRelativeUrl.search}${protocolRelativeUrl.hash}`;
      return responseProfile;
    }

    if (responseProfile.avatarUrl.startsWith('/')) {
      const relativeUrl = new URL(responseProfile.avatarUrl, 'https://jov.ie');
      relativeUrl.searchParams.set('v', cacheBustValue);
      responseProfile.avatarUrl = `${relativeUrl.pathname}${relativeUrl.search}${relativeUrl.hash}`;
      return responseProfile;
    }

    try {
      const url = new URL(responseProfile.avatarUrl);
      url.searchParams.set('v', cacheBustValue);
      responseProfile.avatarUrl = url.toString();
    } catch (error) {
      logger.warn('Failed to parse avatar URL for cache busting', {
        avatarUrl: responseProfile.avatarUrl.split('?')[0],
        error,
      });
    }
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
  if (updatedProfile.usernameNormalized !== oldUsernameNormalized) {
    await invalidateUsernameChange(
      updatedProfile.usernameNormalized,
      oldUsernameNormalized
    );
  } else {
    await invalidateProfileCache(updatedProfile.usernameNormalized);
    await invalidateHomepageCache();
  }

  // Release caches (JOV-6272): the unified release key family is keyed by
  // (userId, profileId) only — the handle never participates — so a rename
  // no longer self-heals through a handle-keyed fork. Invalidate the family
  // explicitly on every profile mutation, rename or not, so the matrix and
  // entity caches never serve rows built from the stale handle.
  invalidateReleaseCaches(clerkUserId, updatedProfile.id);

  trackServerEvent('dashboard_profile_updated', undefined, clerkUserId).catch(
    error => logger.warn('Analytics tracking failed:', error)
  );
}
