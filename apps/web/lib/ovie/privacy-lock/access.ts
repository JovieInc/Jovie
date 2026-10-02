import 'server-only';
// @coverage-via apps/web/lib/ovie/privacy-lock/access.test.ts
import { NextResponse } from 'next/server';
import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';
import { isAdmin } from '@/lib/admin/roles';
import { getFreshAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { assertOviePrivacyUnlocked, OviePrivacyLockError } from './server';
export async function requireOvieApiAccess(options?: { privileged?: boolean }) {
  try {
    const auth = await getFreshAuth();
    if (!auth.userId || !auth.sessionId)
      throw new OviePrivacyLockError('UNAUTHORIZED', 'Please sign in.', 401);
    if (!(await isAdmin(auth.userId)))
      throw new OviePrivacyLockError('FORBIDDEN', 'Admin access required.');
    if (options?.privileged && !(await hasRecentAdminMfaReverification(auth)))
      throw new OviePrivacyLockError(
        'PASSKEY_STEP_UP_REQUIRED',
        'Verify your passkey for this privileged action.'
      );
    await assertOviePrivacyUnlocked({
      userId: auth.userId,
      sessionId: auth.sessionId,
    });
    return null;
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
export function privacyErrorResponse(error: unknown) {
  const known = error instanceof OviePrivacyLockError;
  return NextResponse.json(
    {
      error: known
        ? error.message
        : 'Ovie privacy state is temporarily unavailable.',
      code: known ? error.code : 'PRIVACY_UNAVAILABLE',
    },
    {
      status: known ? error.status : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

/** Default preserves existing entitlement MFA; only audited observations opt into read mode. */
export async function getOvieOperatorEntitlements(options?: {
  session?: 'cookie' | 'fresh';
  purpose?: 'read';
}) {
  const auth = await getFreshAuth();
  if (!auth.userId || !auth.sessionId || !(await isAdmin(auth.userId))) {
    const entitlements = await getCurrentUserEntitlements({ session: 'fresh' });
    return { ...entitlements, isAdmin: false };
  }
  await assertOviePrivacyUnlocked({
    userId: auth.userId,
    sessionId: auth.sessionId,
  });
  const entitlements = await getCurrentUserEntitlements({ session: 'fresh' });
  return {
    ...entitlements,
    isAdmin: options?.purpose === 'read' ? true : entitlements.isAdmin,
  };
}
