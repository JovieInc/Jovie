import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ARTIST_MEMORY_CONTRACT,
  memoryReviewQueue,
} from '@/lib/artist-memory/contract';
import { loadArtistMemory } from '@/lib/artist-memory/queries.server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

const querySchema = z.strictObject({ profileId: z.uuid() });

/** Owner read of "What Jovie knows": every fact plus the one-tap review queue. */
export async function GET(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const owned = await getAuthenticatedProfile(
      db,
      parsed.data.profileId,
      userId
    );
    if (!owned) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const facts = await loadArtistMemory(parsed.data.profileId, 'owner');
    return NextResponse.json(
      {
        contract: ARTIST_MEMORY_CONTRACT,
        facts,
        reviewQueue: memoryReviewQueue(facts).map(f => f.id),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[api/artist-memory] Failed to load artist memory:', error);
    await captureError('Artist memory read failed', error, {
      route: '/api/artist-memory',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load artist memory' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
