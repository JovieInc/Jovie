import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { applyGeneratedAlbumArt } from '@/lib/services/album-art/apply';

export const runtime = 'nodejs';
export const maxDuration = 60;

const applyGeneratedAlbumArtSchema = z.object({
  profileId: z.string().uuid(),
  releaseId: z.string().uuid(),
  generationId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export async function POST(req: Request) {
  let userId: string | null = null;
  try {
    userId = (await getCachedAuth()).userId;
  } catch {
    userId = null;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.canGenerateAlbumArt) {
    return NextResponse.json(
      { error: 'Album art generation requires a Pro plan.' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = applyGeneratedAlbumArtSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await applyGeneratedAlbumArt({
      clerkUserId: userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    captureError('[album-art] Failed to apply generated artwork', error, {
      userId,
      releaseId: parsed.data.releaseId,
      generationId: parsed.data.generationId,
    });
    const message =
      error instanceof Error && error.message.includes('not found')
        ? error.message
        : 'Failed to apply generated album art';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
