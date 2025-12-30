/**
 * Auth gate redirect mapping
 */

import { UserState } from './types';

/**
 * Returns redirect paths for each user state.
 * Used by routes to determine where to redirect users based on their state.
 */
export function getRedirectForState(
  state: UserState,
  claimToken?: string
): string | null {
  switch (state) {
    case UserState.UNAUTHENTICATED:
      return '/signin';
    case UserState.NEEDS_DB_USER:
      return '/onboarding';
    case UserState.NEEDS_WAITLIST_SUBMISSION:
      return '/waitlist';
    case UserState.WAITLIST_PENDING:
      return '/waitlist';
    case UserState.WAITLIST_INVITED:
      return claimToken
        ? `/claim/${encodeURIComponent(claimToken)}`
        : '/waitlist';
    case UserState.NEEDS_ONBOARDING:
      return '/onboarding';
    case UserState.BANNED:
      return '/banned';
    case UserState.ACTIVE:
      return null;
    default:
      return null;
  }
}
