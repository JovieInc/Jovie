/**
 * Auth Gate - Centralized user state resolution
 *
 * @deprecated Import from '@/lib/auth/gate' (directory module) instead.
 * This file re-exports for backwards compatibility.
 *
 * @example
 * ```typescript
 * // New way (preferred)
 * import { resolveUserState, UserState } from '@/lib/auth/gate';
 *
 * // Old way (still works)
 * import { resolveUserState, UserState } from '@/lib/auth/gate.ts';
 * ```
 */

'server only';

// Re-export everything from the new module structure
export {
  type AuthGateContext,
  type AuthGateResult,
  canAccessApp,
  canAccessOnboarding,
  // Waitlist
  checkWaitlistAccess,
  // Redirects
  getRedirectForState,
  // Validators
  isProfileComplete,
  type ProfileCompleteness,
  type ResolveUserStateOptions,
  requiresRedirect,
  // Main resolver
  resolveUserState,
  // Types
  UserState,
  type WaitlistAccessResult,
} from './gate/index';
