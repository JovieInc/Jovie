/**
 * User Status Checker
 *
 * Handles user status validation for auth gating.
 */

// eslint-disable-next-line import/no-cycle -- mutual dependency with gate.ts for auth state
import { UserState } from './gate';

/**
 * Result of user status check.
 */
export interface UserStatusCheckResult {
  /** Whether user is blocked (banned, suspended, or deleted) */
  isBlocked: boolean;
  /** User state if blocked */
  blockedState: UserState | null;
  /** Redirect path if blocked */
  redirectTo: string | null;
}

/**
 * Checks if a user is blocked due to ban, suspension, or deletion.
 *
 * @param userStatus - User status from database
 * @param deletedAt - Deletion timestamp
 * @returns Status check result
 */
export function checkUserStatus(
  userStatus: string | null,
  deletedAt: Date | null
): UserStatusCheckResult {
  // Check soft deletion first
  if (deletedAt) {
    return {
      isBlocked: true,
      blockedState: UserState.BANNED,
      redirectTo: '/banned',
    };
  }

  // Check explicit ban or suspension
  if (userStatus === 'banned' || userStatus === 'suspended') {
    return {
      isBlocked: true,
      blockedState: UserState.BANNED,
      redirectTo: '/banned',
    };
  }

  return {
    isBlocked: false,
    blockedState: null,
    redirectTo: null,
  };
}
