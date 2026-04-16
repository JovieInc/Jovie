import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { createReleaseAndApplyGeneratedAlbumArt } from '@/lib/services/album-art/apply';
import { parseAlbumArtRequestBody, requireAlbumArtUser } from '../shared';

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
    return NextResponse.json(
      { error: 'Failed to create release with generated album art' },
      { status: 500 }
    );
  }
}
