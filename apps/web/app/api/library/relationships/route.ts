import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import {
  removeYouTubeVideoMerchTag,
  tagYouTubeVideoWithMerch,
} from '@/lib/library/graph-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  creatorProfileId: z.string().uuid(),
  videoId: z.string().uuid(),
  merchCardId: z.string().uuid(),
});

async function authorize(creatorProfileId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) return { ok: false as const, status: 401, userId: null };
  const access = await getExactProfileAccess(db, userId, creatorProfileId);
  if (!access.ok) return { ok: false as const, status: 403, userId };
  return { ok: true as const, status: 200, userId };
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid relationship' },
      { status: 400 }
    );
  }
  const auth = await authorize(parsed.data.creatorProfileId);
  if (!auth.ok || !auth.userId) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  const relationship = await tagYouTubeVideoWithMerch({
    ...parsed.data,
    actorUserId: auth.userId,
  });
  return relationship
    ? NextResponse.json({ relationship }, { status: 201 })
    : NextResponse.json(
        { error: 'Video or merch product not found' },
        { status: 404 }
      );
}

export async function DELETE(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid relationship' },
      { status: 400 }
    );
  }
  const auth = await authorize(parsed.data.creatorProfileId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  const removed = await removeYouTubeVideoMerchTag(parsed.data);
  return removed
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { error: 'Active relationship not found' },
        { status: 404 }
      );
}
