import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { getYouTubeOptimizationSnapshotForProfile } from '@/lib/youtube-library/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ creatorProfileId: z.string().uuid() });
const paramsSchema = z.object({ videoId: z.string().uuid() });

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly videoId: string }> }
) {
  const query = querySchema.safeParse({
    creatorProfileId: new URL(request.url).searchParams.get('creatorProfileId'),
  });
  const params = paramsSchema.safeParse(await context.params);
  if (!query.success || !params.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const access = await getExactProfileAccess(
    db,
    userId,
    query.data.creatorProfileId
  );
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const snapshot = await getYouTubeOptimizationSnapshotForProfile({
    creatorProfileId: query.data.creatorProfileId,
    videoId: params.data.videoId,
  });
  return snapshot
    ? NextResponse.json({ snapshot })
    : NextResponse.json({ error: 'Video not found' }, { status: 404 });
}
