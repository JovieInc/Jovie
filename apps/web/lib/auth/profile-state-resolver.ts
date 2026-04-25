/**
 * Profile State Resolver
 *
 * Resolves user state based on creator profile status.
 * Uses the canonical isProfileComplete() from profile-completeness.ts.
 */

import { CanonicalUserState } from './canonical-user-state';
import { isProfileComplete } from './profile-completeness';

/**
 * Profile data for state resolution.
 */
export interface ProfileData {
  id: string;
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
  hasVisibleRelease?: boolean | null;
}

/**
 * Result of profile state resolution.
 */
export interface ProfileStateResult {
  state: CanonicalUserState;
  profileId: string | null;
  redirectTo: string | null;
}

// Re-export for consumers that imported isProfileComplete from here
export { isProfileComplete } from './profile-completeness';

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
      state: CanonicalUserState.NEEDS_ONBOARDING,
      profileId: null,
      redirectTo: '/onboarding?fresh_signup=true',
    };
  }

  // Profile exists but is incomplete
  if (!isProfileComplete(profile)) {
    return {
      state: CanonicalUserState.NEEDS_ONBOARDING,
      profileId: profile.id,
      redirectTo: '/onboarding?fresh_signup=true',
    };
  }

  // Profile is complete - user is active
  return {
    state: CanonicalUserState.ACTIVE,
    profileId: profile.id,
    redirectTo: null,
  };
}
