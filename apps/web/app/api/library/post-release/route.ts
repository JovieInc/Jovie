import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { applyPresenceFindingAction } from '@/lib/library/post-release-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  creatorProfileId: z.string().uuid(),
  findingId: z.string().uuid(),
  action: z.enum([
    'prepare_update',
    'not_this_artist',
    'not_this_song',
    'confirmed_match',
    'dismiss',
  ]),
});

export async function PATCH(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const access = await getExactProfileAccess(
    db,
    userId,
    parsed.data.creatorProfileId
  );
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const finding = await applyPresenceFindingAction({
    ...parsed.data,
    actorUserId: userId,
  });
  return finding
    ? NextResponse.json({ finding })
    : NextResponse.json(
        { error: 'Finding cannot take that action' },
        { status: 409 }
      );
}
