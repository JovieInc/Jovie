/**
 * Shim over `@/tests/helpers/auth` (Clerk → Better Auth migration, commit ⑩).
 * The 1354-line Clerk-era helper is replaced by the <400-line BA-native
 * helper. All export names are preserved so the 51 spec importers don't
 * churn. New tests should import from `@/tests/helpers/auth` directly.
 *
 * The `@clerk/testing/playwright` import (`setupClerkTestingToken`) is gone
 * — under Better Auth the dev bypass route mints a real session cookie, no
 * testing token is needed.
 */

export {
  ClerkTestError,
  canFallbackToBypassUserId,
  createOrReuseTestUserSession,
  ensureSignedInUser,
  getAdminCredentials,
  hasAdminCredentials,
  hasClerkCredentials,
  hasClerkOriginMismatchSignal,
  isAuthenticated,
  isClerkHandshakeUrl,
  isClerkOriginMismatchMessage,
  isClerkTestEmail,
  isProductionTarget,
  isTestingEnvironment,
  resolveBypassFallbackUserId,
  resolveBypassSessionUrls,
  setTestAuthBypassSession,
  setupAuthenticatedTest,
  signInUser,
  signOutUser,
  waitForAuthenticatedHealth,
  waitForClerkSignInApi,
} from '@/tests/helpers/auth';
