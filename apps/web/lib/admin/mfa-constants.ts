// @coverage-via apps/web/tests/unit/lib/admin/mfa.test.ts
/** A passkey (Touch ID) step-up unlocks admin data for this long. */
export const ADMIN_STEP_UP_TTL_MS = 12 * 60 * 60 * 1000;

/** First passkey enrollment requires a sign-in at most this old. */
export const PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS = 10 * 60 * 1000;

export function adminStepUpIdentifier(sessionId: string): string {
  return `admin-step-up:${sessionId}`;
}
