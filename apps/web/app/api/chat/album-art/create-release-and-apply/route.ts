import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { createReleaseAndApplyGeneratedAlbumArt } from '@/lib/services/album-art/apply';
import { logger } from '@/lib/utils/logger';
import { parseAlbumArtRequestBody, requireAlbumArtUser } from '../shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const createReleaseAndApplySchema = z.object({
  profileId: z.string().uuid(),
  title: z.string().min(1).max(200),
  releaseType: z
    .enum(['single', 'ep', 'album', 'compilation', 'live', 'mixtape', 'other'])
    .default('single'),
  releaseDate: z
    .string()
    .refine(isValidIsoDate, { message: 'Invalid releaseDate' })
    .optional(),
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
    createReleaseAndApplySchema
  );
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await createReleaseAndApplyGeneratedAlbumArt({
      clerkUserId: auth.userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    captureError('[album-art] Failed to create release with artwork', error, {
      userId: auth.userId,
      generationId: parsed.data.generationId,
    });
    logger.error('[album-art] Failed to create release with artwork', {
      userId: auth.userId,
      generationId: parsed.data.generationId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to create release with generated album art' },
      { status: 500 }
    );
  }
}
