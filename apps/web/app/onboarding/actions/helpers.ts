/**
 * Internal helper utilities for onboarding
 */

import type { CreatorProfile } from './types';

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
