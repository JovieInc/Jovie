import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getDbUser } from '@/lib/auth/session';
import { isTestAuthBypassEnabled } from '@/lib/auth/test-mode';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import {
  canReadHealthDetail,
  HEALTH_DETAIL_HEADERS,
  publicHealthLiveness,
} from '@/lib/health/detail-access';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

function resolveDevFastAuthHealthContext() {
  const authMockEnabled =
    process.env.NEXT_PUBLIC_AUTH_MOCK === '1' ||
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1';
  const authProxyDisabled =
    process.env.NEXT_PUBLIC_AUTH_PROXY_DISABLED === '1' ||
    process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1';
  const testAuthBypassEnabled = isTestAuthBypassEnabled();
  const active = authMockEnabled || authProxyDisabled || testAuthBypassEnabled;

  return {
    active,
    authMockEnabled,
    authProxyDisabled,
    testAuthBypassEnabled,
    authMiddleware: active ? ('bypassed' as const) : ('active' as const),
  };
}

// Production stays closed, including for admin and test-bypass (JOV lesson).
// Outside production, anonymous callers get liveness only. Session and profile
// detail requires CRON_SECRET or an admin session. Test-bypass alone does not
// unlock the detailed body.
export async function GET(request: Request) {
  try {
    if (process.env.VERCEL_ENV === 'production') {
      return NextResponse.json(
        { ok: false, error: 'Only available in development' },
        { status: 403, headers: HEALTH_DETAIL_HEADERS }
      );
    }

    const authorized = await canReadHealthDetail(request, '/api/health/auth');
    if (!authorized) {
      return publicHealthLiveness(true);
    }

    const devFast = resolveDevFastAuthHealthContext();
    const { userId } = await getOptionalAuth();

    if (!userId) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: false,
          devFast,
          message: devFast.active
            ? 'No session - dev-fast auth bypass active; use /api/dev/test-auth/session to probe authenticated state'
            : 'No session - this is expected for anonymous requests',
        },
        { headers: HEALTH_DETAIL_HEADERS }
      );
    }

    // Test that we can find the user and their profile
    const user = await getDbUser(userId);

    if (!user) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          userId,
          hasProfile: false,
          devFast,
          message:
            'User authenticated but not found in database ' +
            '(expected for new users)',
        },
        { headers: HEALTH_DETAIL_HEADERS }
      );
    }

    // Try to find user's creator profile
    const [profile] = await db
      .select({ id: creatorProfiles.id, username: creatorProfiles.username })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, user.id))
      .limit(1);

    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        userId,
        hasProfile: !!profile,
        profile: profile
          ? { id: profile.id, username: profile.username }
          : null,
        devFast,
        message: devFast.active
          ? 'Dev-fast auth bypass + Drizzle auth validation successful'
          : 'Better Auth + Drizzle auth validation successful',
      },
      { headers: HEALTH_DETAIL_HEADERS }
    );
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error('Unknown error');
    // Log full error details server-side for debugging
    logger.error('[health/auth] Error:', error);
    void captureWarning('Auth health check failed', e, {
      service: 'auth',
      route: '/api/health/auth',
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: HEALTH_DETAIL_HEADERS }
    );
  }
}
