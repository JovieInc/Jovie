/**
 * Auth gate validation and access check utilities
 */

import type { ProfileCompleteness } from './types';
import { UserState } from './types';

/**
 * Determines if a creator profile is considered "complete" for access purposes.
 * A complete profile has: username, display name, is public, and has completed onboarding.
 */
export function isProfileComplete(profile: ProfileCompleteness): boolean {
  const hasHandle =
    Boolean(profile.usernameNormalized) && Boolean(profile.username);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

/**
 * Utility to check if a state allows access to the main app.
 */
export function canAccessApp(state: UserState): boolean {
  return state === UserState.ACTIVE;
}

/**
 * Utility to check if a state allows access to onboarding.
 */
export function canAccessOnboarding(state: UserState): boolean {
  return state === UserState.NEEDS_ONBOARDING || state === UserState.ACTIVE;
}

/**
 * Utility to check if a state requires redirect away from protected routes.
 */
export function requiresRedirect(state: UserState): boolean {
  return state !== UserState.ACTIVE;
}
