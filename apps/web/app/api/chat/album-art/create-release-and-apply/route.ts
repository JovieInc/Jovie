import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { createReleaseAndApplyGeneratedAlbumArt } from '@/lib/services/album-art/apply';

export const runtime = 'nodejs';
export const maxDuration = 60;

const createReleaseAndApplySchema = z.object({
  profileId: z.string().uuid(),
  title: z.string().min(1).max(200),
  releaseType: z
    .enum(['single', 'ep', 'album', 'compilation', 'live', 'mixtape', 'other'])
    .default('single'),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

  const parsed = createReleaseAndApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await createReleaseAndApplyGeneratedAlbumArt({
      clerkUserId: userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    captureError('[album-art] Failed to create release with artwork', error, {
      userId,
      generationId: parsed.data.generationId,
    });
    return NextResponse.json(
      { error: 'Failed to create release with generated album art' },
      { status: 500 }
    );
  }
}
