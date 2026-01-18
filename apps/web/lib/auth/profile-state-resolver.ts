/**
 * Profile State Resolver
 *
 * Resolves user state based on creator profile status.
 */

import { UserState } from './gate';

/**
 * Profile data for state resolution.
 */
export interface ProfileData {
  id: string;
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
}

/**
 * Result of profile state resolution.
 */
export interface ProfileStateResult {
  state: UserState;
  profileId: string | null;
  redirectTo: string | null;
}

/**
 * Determines if a creator profile is considered "complete" for access purposes.
 * A complete profile has: username, display name, is public, and has completed onboarding.
 *
 * @param profile - Profile data to check
 * @returns Whether the profile is complete
 */
export function isProfileComplete(profile: ProfileData): boolean {
  const hasHandle =
    Boolean(profile.usernameNormalized) && Boolean(profile.username);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

/**
 * Resolves user state based on profile status.
 *
 * @param profile - Creator profile data, or null if no profile exists
 * @returns Profile state result
 */
export function resolveProfileState(
  profile: ProfileData | null
): ProfileStateResult {
  // No profile exists
  if (!profile) {
    return {
      state: UserState.NEEDS_ONBOARDING,
      profileId: null,
      redirectTo: '/onboarding?fresh_signup=true',
    };
  }

  // Profile exists but is incomplete
  if (!isProfileComplete(profile)) {
    return {
      state: UserState.NEEDS_ONBOARDING,
      profileId: profile.id,
      redirectTo: '/onboarding?fresh_signup=true',
    };
  }

  // Profile is complete - user is active
  return {
    state: UserState.ACTIVE,
    profileId: profile.id,
    redirectTo: null,
  };
}
