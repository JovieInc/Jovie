/**
 * Profile Response Helpers
 *
 * Helper functions for building profile API responses.
 */

import { revalidateTag } from 'next/cache';

import {
  invalidateHomepageCache,
  invalidateProfileCache,
  invalidateUsernameChange,
} from '@/lib/cache/profile';
import { createReleaseCacheTag } from '@/lib/cache/tags';
import type { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackServerEvent } from '@/lib/server-analytics';
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
  // JOV-6272: release view models embed handle-derived smart-link paths. The
  // releases cache family is keyed on (userId, profileId) — invariant under a
  // handle change — so one tag revalidation clears both the old-handle and
  // new-handle cached projections. Do this on EVERY profile save: a cached
  // value is never authorization, and stale handle-derived paths must not
  // survive any profile mutation.
  revalidateTag(createReleaseCacheTag(clerkUserId, updatedProfile.id), 'max');

  if (updatedProfile.usernameNormalized !== oldUsernameNormalized) {
    await invalidateUsernameChange(
      updatedProfile.usernameNormalized,
      oldUsernameNormalized
    );
  } else {
    await invalidateProfileCache(updatedProfile.usernameNormalized);
    await invalidateHomepageCache();
  }

  const delivery = await trackServerEvent(
    'dashboard_profile_updated',
    { profileId: updatedProfile.id },
    clerkUserId
  );
  if (!delivery.ok) {
    logger.warn('Analytics tracking failed', { error: delivery.error });
  }
}
