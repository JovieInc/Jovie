import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getCachedAuth, getFreshAuth } from '@/lib/auth/cached';
import { maskUserIdForLog } from '@/lib/auth/mask-user-id';
import { captureWarning } from '@/lib/error-tracking';
import { privacyErrorResponse } from '@/lib/ovie/privacy-lock/access';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';
import { hasRecentAdminMfaReverification } from './mfa';
import { isAdmin } from './roles';

/**
 * Admin route protection middleware
 *
 * Verifies admin role plus a live passkey step-up receipt
 * (`hasRecentAdminMfaReverification`, fail closed). Aligns privileged
 * admin APIs with entitlements/`operatorAccess` MFA gating.
 *
 * Usage in API routes:
 * ```typescript
 * import { requireAdmin } from '@/lib/admin/middleware';
 *
 * export async function GET(request: Request) {
 *   const authError = await requireAdmin();
 *   if (authError) return authError;
 *
 *   // Admin-only logic here
 * }
 * ```
 *
 * @returns NextResponse with 401/403 if denied, null if authorized
 */
export async function requireAdmin(options?: {
  session?: 'cookie' | 'fresh';
}): Promise<NextResponse | null> {
  const readAuth = options?.session === 'fresh' ? getFreshAuth : getCachedAuth;
  const auth = await readAuth();
  const { userId } = auth;
  const adminUserId = auth.actorUserId ?? userId;

  // User not authenticated. This is routine traffic (unauth hits to admin
  // routes) — not an actionable signal, so we record a breadcrumb for
  // audit correlation but do not emit a Sentry event. The authenticated-
  // but-not-admin case below remains a captureWarning since that IS worth
  // surfacing.
  if (!adminUserId) {
    Sentry.addBreadcrumb({
      category: 'admin',
      level: 'info',
      message: 'admin/middleware: unauth hit (no user id)',
    });
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in.' },
      { status: 401 }
    );
  }

  // Check admin status
  const userIsAdmin = await isAdmin(adminUserId);

  // Mask user ID for logging to prevent PII exposure
  const maskedUserId = maskUserIdForLog(adminUserId);

  if (!userIsAdmin) {
    // Log unauthorized access attempt with masked ID
    captureWarning(
      `[admin/middleware] Forbidden admin access attempt by user: ${maskedUserId}`
    );

    return NextResponse.json(
      { error: 'Forbidden. Admin privileges required.' },
      { status: 403 }
    );
  }

  // Privileged admin mutations (impersonate, set-plan, flags, investors)
  // require the same passkey step-up as entitlements `isAdmin`. Fail closed
  // when the receipt is missing, expired, or unreadable.
  if (!(await hasRecentAdminMfaReverification(auth))) {
    captureWarning(
      `[admin/middleware] Admin MFA step-up required for user: ${maskedUserId}`
    );
    return NextResponse.json(
      {
        error: 'Verify your passkey for this privileged action.',
        code: 'PASSKEY_STEP_UP_REQUIRED',
      },
      { status: 403 }
    );
  }

  try {
    await assertOviePrivacyUnlocked(
      adminUserId && auth.sessionId
        ? { userId: adminUserId, sessionId: auth.sessionId }
        : undefined
    );
  } catch (error) {
    return privacyErrorResponse(error);
  }

  // Log successful admin access with masked ID (for audit trail)
  Sentry.addBreadcrumb({
    category: 'admin',
    message: `Admin access granted to user: ${maskedUserId}`,
    level: 'info',
  });

  // Authorization successful
  return null;
}

/**
 * Check if current user is admin without throwing errors
 *
 * Useful for conditional UI rendering in server components
 *
 * @returns Promise<boolean> - True if user is admin
 */
export async function checkIsAdmin(): Promise<boolean> {
  const auth = await getCachedAuth();
  const adminUserId = auth.actorUserId ?? auth.userId;
  if (!adminUserId) return false;
  return isAdmin(adminUserId);
}
