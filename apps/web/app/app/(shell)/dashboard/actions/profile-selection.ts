/**
 * Profile selection logic for dashboard.
 *
 * @deprecated This file's exports have moved to @/lib/db/server
 * Import from there instead:
 * - import { profileIsPublishable, selectDashboardProfile } from '@/lib/db/server';
 *
 * This file remains for backward compatibility and will be removed in a future version.
 *
 * This module provides functions to determine which creator profile
 * should be displayed on the dashboard. It handles profile selection
 * based on publishability and recency.
 */

import type { CreatorProfile } from '@/lib/db/schema';

/**
 * Determines if a creator profile meets the minimum requirements
 * to be considered publishable.
 *
 * A profile is publishable when it has:
 * - A claimed handle (username and usernameNormalized)
 * - A display name
 * - Is set to public
 * - Has completed onboarding at least once
 *
 * @param profile - The creator profile to check, or null
 * @returns true if the profile is publishable, false otherwise
 */
export function profileIsPublishable(profile: CreatorProfile | null): boolean {
  if (!profile) return false;

  // A minimum viable profile must have a claimed handle, a display name,
  // be public, and have completed onboarding at least once.
  const hasHandle =
    Boolean(profile.usernameNormalized) && Boolean(profile.username);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

/**
 * Selects the most appropriate creator profile to display on the dashboard.
 *
 * Selection priority:
 * 1. First publishable profile found
 * 2. If no publishable profile, the most recently updated profile
 * 3. If update times are equal, the most recently created profile
 *
 * @param profiles - Array of creator profiles to choose from
 * @returns The selected profile (first profile if array has at least one element)
 * @throws May throw if profiles array is empty
 */
export function selectDashboardProfile(
  profiles: CreatorProfile[]
): CreatorProfile {
  const publishable = profiles.find(profileIsPublishable);
  if (publishable) return publishable;

  const byRecency = [...profiles].sort((a, b) => {
    const aUpdated = a.updatedAt ? a.updatedAt.getTime() : 0;
    const bUpdated = b.updatedAt ? b.updatedAt.getTime() : 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
    const bCreated = b.createdAt ? b.createdAt.getTime() : 0;
    return bCreated - aCreated;
  });

  return byRecency[0];
}
