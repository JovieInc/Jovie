/**
 * Internal helper utilities for onboarding
 */

import { publicEnv } from '@/lib/env-public';
import type { CreatorProfile } from './types';

/**
 * Determines the base URL from request headers.
 */
export function getRequestBaseUrl(headersList: Headers): string {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return publicEnv.NEXT_PUBLIC_APP_URL;
}

/**
 * Checks if a profile meets all requirements to be published.
 */
export function profileIsPublishable(profile: CreatorProfile | null): boolean {
  if (!profile) return false;
  const hasHandle =
    Boolean(profile.username) && Boolean(profile.usernameNormalized);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}
