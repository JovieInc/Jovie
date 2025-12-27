import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries';
import { creatorProfiles } from '@/lib/db/schema';
import { NO_STORE_HEADERS } from '@/lib/api/constants';

export const dynamic = 'force-dynamic';


// Internal health check that validates auth.jwt()->>'sub' path
// Only accessible in development for security
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { ok: false, error: 'Only available in development' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const { userId } = await auth();

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
    const user = await getUserByClerkId(userId);

    if (!user) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          userId,
          hasProfile: false,
          message:
            'User authenticated but not found in database (expected for new users)',
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
    return NextResponse.json(
      { ok: false, error: error.message, stack: error.stack },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
