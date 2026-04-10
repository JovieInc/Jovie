import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDbUser } from '@/lib/auth/session';
import { resolveTestBypassUserId } from '@/lib/auth/test-mode';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Internal health check that validates auth.jwt()->>'sub' path
// Only accessible in development unless a trusted test-bypass request is probing
// preview auth during CI.
export async function GET() {
  try {
    if (process.env.VERCEL_ENV === 'production') {
      return NextResponse.json(
        { ok: false, error: 'Only available in development' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const headerStore = await headers();
    const cookieStore = await cookies();
    const allowTestBypassProbe = Boolean(
      resolveTestBypassUserId(headerStore, cookieStore)
    );

    if (process.env.NODE_ENV !== 'development' && !allowTestBypassProbe) {
      return NextResponse.json(
        { ok: false, error: 'Only available in development' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { userId } = await getCachedAuth();

    if (!userId) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: false,
          message: 'No session - this is expected for anonymous requests',
        },
        { headers: NO_STORE_HEADERS }
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
          message:
            'User authenticated but not found in database ' +
            '(expected for new users)',
        },
        { headers: NO_STORE_HEADERS }
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
        message: 'Clerk + Drizzle auth validation successful',
      },
      { headers: NO_STORE_HEADERS }
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
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
