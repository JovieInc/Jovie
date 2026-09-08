import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { presenceActionFailureStatus } from '@/lib/library/post-release';
import { LIBRARY_POST_RELEASE_OPTIMIZATION } from '@/lib/library/post-release-optimization';
import {
  applyPresenceFindingAction,
  listLibraryPostReleaseBundle,
} from '@/lib/library/post-release-store';

export const dynamic = 'force-dynamic';

const profileQuerySchema = z.object({ creatorProfileId: z.string().uuid() });
const bodySchema = profileQuerySchema.extend({
  findingId: z.string().uuid(),
  action: z.enum([
    'prepare_update',
    'not_this_artist',
    'not_this_song',
    'confirmed_match',
    'dismiss',
  ]),
});

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function requireProfileAccess(creatorProfileId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) return { error: json({ error: 'Unauthorized' }, 401) };
  const access = await getExactProfileAccess(db, userId, creatorProfileId);
  if (!access.ok) return { error: json({ error: 'Forbidden' }, 403) };
  return { userId };
}

export async function GET(request: NextRequest) {
  const parsed = profileQuerySchema.safeParse({
    creatorProfileId: request.nextUrl.searchParams.get('creatorProfileId'),
  });
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400);
  const auth = await requireProfileAccess(parsed.data.creatorProfileId);
  if ('error' in auth) return auth.error;
  try {
    const bundle = await listLibraryPostReleaseBundle(
      parsed.data.creatorProfileId
    );
    return json({ ...bundle, optimization: LIBRARY_POST_RELEASE_OPTIMIZATION });
  } catch (error) {
    await captureError('Library post-release lookup failed', error, {
      route: '/api/library/post-release',
      method: 'GET',
    });
    return json({ error: 'Failed to load post-release presence' }, 500);
  }
}

export async function PATCH(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid action' }, 400);
  const auth = await requireProfileAccess(parsed.data.creatorProfileId);
  if ('error' in auth) return auth.error;
  try {
    const result = await applyPresenceFindingAction({
      ...parsed.data,
      actorUserId: auth.userId,
    });
    if (!result.ok) {
      const missing = result.reason === 'not_found';
      return json(
        {
          error: missing
            ? 'Finding not found'
            : 'Finding cannot take that action',
        },
        presenceActionFailureStatus(result.reason)
      );
    }
    return json({
      finding: result.finding,
      optimization: LIBRARY_POST_RELEASE_OPTIMIZATION,
    });
  } catch (error) {
    await captureError('Library post-release action failed', error, {
      route: '/api/library/post-release',
      method: 'PATCH',
    });
    return json({ error: 'Failed to apply presence action' }, 500);
  }
}
