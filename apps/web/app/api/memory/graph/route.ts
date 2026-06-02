import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';
import { queryMemoryGraph } from '@/lib/memory/graph-query';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        activeProfileId: users.activeProfileId,
      })
      .from(users)
      .where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!user?.activeProfileId) {
      return NextResponse.json(
        { error: 'No active creator profile.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL(request.url);
    const entityId = url.searchParams.get('entityId') ?? undefined;
    const graph = await queryMemoryGraph(
      {
        userId: user.id,
        creatorProfileId: user.activeProfileId,
      },
      { entityId }
    );

    return NextResponse.json({ graph }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Memory graph query failed', {
      error: error instanceof Error ? error.message : error,
    });
    await captureError('Memory graph query failed', error, {
      route: '/api/memory/graph',
    });
    return NextResponse.json(
      { error: 'Unable to load memory graph.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
