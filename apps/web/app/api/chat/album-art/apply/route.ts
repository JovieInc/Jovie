import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { applyGeneratedAlbumArt } from '@/lib/services/album-art/apply';
import { logger } from '@/lib/utils/logger';
import { parseAlbumArtRequestBody, requireAlbumArtUser } from '../shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

const applyGeneratedAlbumArtSchema = z.object({
  profileId: z.string().uuid(),
  releaseId: z.string().uuid(),
  generationId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await requireAlbumArtUser();
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseAlbumArtRequestBody(
    req,
    applyGeneratedAlbumArtSchema
  );
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await applyGeneratedAlbumArt({
      clerkUserId: auth.userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    captureError('[album-art] Failed to apply generated artwork', error, {
      userId: auth.userId,
      releaseId: parsed.data.releaseId,
      generationId: parsed.data.generationId,
    });
    logger.error('[album-art] Failed to apply generated artwork', {
      userId: auth.userId,
      releaseId: parsed.data.releaseId,
      generationId: parsed.data.generationId,
      error,
    });
    const isNotFound =
      error instanceof Error &&
      error.message.toLowerCase().includes('not found');
    const message = isNotFound
      ? error.message
      : 'Failed to apply generated album art';
    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
