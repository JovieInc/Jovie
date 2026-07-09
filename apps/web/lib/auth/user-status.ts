/**
 * User lifecycle status derivation, shared by the auth gate's lazy-create
 * path (gate.ts) and Better Auth provisioning (provision.ts).
 *
 * Extracted from gate.ts so both entry points derive `users.user_status`
 * identically — the hook-vs-lazy-create provisioning race must converge on
 * the same status for the same inputs.
 */

/** User status type alias for user lifecycle states */
export type UserLifecycleStatus =
  | 'waitlist_pending'
  | 'waitlist_approved'
  | 'profile_claimed'
  | 'onboarding_incomplete'
  | 'active';

/** Data structure for existing user profile information */
export interface ExistingUserData {
  profileId: string | null;
  onboardingComplete: Date | null;
}

/**
 * Determine user status based on waitlist entry and profile state.
 * Implements the state progression: waitlist_pending → waitlist_approved → active
 */
export function determineUserStatus(
  waitlistEntryId: string | undefined,
  existingUserData: ExistingUserData | undefined,
  waitlistGateEnabled: boolean
): UserLifecycleStatus {
  if (!waitlistEntryId) {
    // When waitlist is disabled, skip waitlist states — treat as approved
    if (!waitlistGateEnabled) {
      const hasClaimedProfile = !!existingUserData?.profileId; // joined via activeProfileId = claimed
      if (!hasClaimedProfile) {
        return 'waitlist_approved';
      }
      return existingUserData.onboardingComplete
        ? 'active'
        : 'onboarding_incomplete';
    }
    return 'waitlist_pending';
  }

  const hasClaimedProfile = !!existingUserData?.profileId; // joined via activeProfileId = claimed
  if (!hasClaimedProfile) {
    return 'waitlist_approved';
  }

  return existingUserData.onboardingComplete
    ? 'active'
    : 'onboarding_incomplete';
}
