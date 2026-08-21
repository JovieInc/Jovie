import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { getDashboardContacts } from '@/lib/contacts/queries';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

export async function GET(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const profileId = new URL(request.url).searchParams.get('profileId');
    if (!profileId) {
      return NextResponse.json(
        { error: 'Missing profileId' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const contacts = await withDbSessionTx(
      async (tx, sessionUserId) => {
        const [profile] = await tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .innerJoin(users, eq(users.id, creatorProfiles.userId))
          .where(
            and(eq(creatorProfiles.id, profileId), eq(users.id, sessionUserId))
          )
          .limit(1);
        if (!profile) return null;

        return getDashboardContacts(tx, profileId);
      },
      { clerkUserId: userId }
    );

    if (!contacts) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(contacts, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[contacts] Failed to load contacts:', error);
    await captureError('Dashboard contacts fetch failed', error, {
      route: '/api/dashboard/contacts',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load contacts' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
