/**
 * Auth Gate - Centralized user state resolution
 *
 * Provides a single source of truth for auth state resolution,
 * replacing scattered auth checks throughout the codebase.
 *
 * @example
 * ```typescript
 * import { resolveUserState, UserState, canAccessApp } from '@/lib/auth/gate';
 *
 * const result = await resolveUserState();
 * if (!canAccessApp(result.state)) {
 *   redirect(result.redirectTo ?? '/signin');
 * }
 * ```
 */

// Redirect mapping
export { getRedirectForState } from './redirects';
// Main resolver
export { resolveUserState } from './resolver';
export type {
  AuthGateContext,
  AuthGateResult,
  ProfileCompleteness,
  ResolveUserStateOptions,
  WaitlistAccessResult,
} from './types';
// Types
export { UserState } from './types';
// Validators and access checks
export {
  canAccessApp,
  canAccessOnboarding,
  isProfileComplete,
  requiresRedirect,
} from './validators';

// Waitlist access (for reuse)
export { checkWaitlistAccess } from './waitlist';
