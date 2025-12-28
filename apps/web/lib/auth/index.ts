/**
 * Auth module exports
 *
 * This module provides centralized authentication and authorization utilities.
 */

// Centralized auth gate (primary API for auth state resolution)
export {
  resolveUserState,
  UserState,
  canAccessApp,
  requiresRedirect,
  getRedirectPath,
  ensureDbUser,
  type AuthGateResult,
} from './gate';

// Cached Clerk auth helpers
export { getCachedAuth, getCachedCurrentUser, requireAuth } from './cached';

// Clerk identity resolution
export { resolveClerkIdentity, type ClerkResolvedIdentity } from './clerk-identity';

// Auth types
export type { AuthMethod, LoadingState } from './types';
