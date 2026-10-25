import 'server-only';
// @coverage-via apps/web/lib/ovie/privacy-lock/access.test.ts
import { NextResponse } from 'next/server';
import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';
import { getAdminAccess, isAdmin } from '@/lib/admin/roles';
import { getFreshAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { assertOviePrivacyUnlocked, OviePrivacyLockError } from './server';
/**
 * `access: 'write'` (the default) admits full admins only. `access: 'read'` also
 * admits read-only operators and must only be passed from GET/HEAD handlers
 * (admin-read-only-contract.test.ts enforces this). A privileged action is always
 * a write.
 */
export async function requireOvieApiAccess(options?: {
  privileged?: boolean;
  access?: 'read' | 'write';
}) {
  try {
    const auth = await getFreshAuth();
    if (!auth.userId || !auth.sessionId)
      throw new OviePrivacyLockError('UNAUTHORIZED', 'Please sign in.', 401);
    if (options?.privileged && options.access === 'read')
      throw new OviePrivacyLockError(
        'FORBIDDEN',
        'A privileged action cannot be a read.'
      );
    if (!(await isAdmin(auth.userId))) {
      const readOnly =
        options?.access === 'read' &&
        (await getAdminAccess(auth.userId)) === 'read';
      if (!readOnly)
        throw new OviePrivacyLockError('FORBIDDEN', 'Admin access required.');
    }
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
  const readOnlyObserver =
    options?.purpose === 'read' &&
    Boolean(auth.userId && auth.sessionId) &&
    !(await isAdmin(auth.userId as string)) &&
    (await getAdminAccess(auth.userId as string)) === 'read';
  if (
    !auth.userId ||
    !auth.sessionId ||
    (!readOnlyObserver && !(await isAdmin(auth.userId)))
  ) {
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
