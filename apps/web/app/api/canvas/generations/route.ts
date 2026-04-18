import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  createCanvasGeneration,
  getOwnedReleaseCanvasContext,
  processCanvasGeneration,
  resolveOwnedTrackCanvasContext,
} from '@/lib/services/canvas/service';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const requestSchema = z.object({
  trackId: z.string().uuid(),
  source: z.enum(['release_artwork']).optional().default('release_artwork'),
  motionPreset: z
    .enum(['ambient', 'zoom', 'pan', 'particles', 'morph'])
    .optional()
    .default('ambient'),
});

export async function POST(request: Request) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.aiCanUseTools) {
    return NextResponse.json(
      { error: 'Canvas generation requires an upgraded plan.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const track = await resolveOwnedTrackCanvasContext({
      creatorProfileId: profile.id,
      trackId: parsed.data.trackId,
    });
    const release = await getOwnedReleaseCanvasContext({
      creatorProfileId: profile.id,
      releaseId: track.releaseId,
    });

    if (!release.artworkUrl) {
      return NextResponse.json(
        { error: 'Upload artwork first before generating a Canvas.' },
        { status: 400 }
      );
    }

    const generation = await createCanvasGeneration({
      creatorProfileId: profile.id,
      releaseId: release.releaseId,
      trackId: track.trackId,
      releaseTrackId: track.releaseTrackId,
      artworkUrl: release.artworkUrl,
      releaseTitle: release.title,
      artistName: profile.displayName ?? 'Artist',
      motionPreset: parsed.data.motionPreset,
    });

    after(async () => {
      await processCanvasGeneration(generation.id).catch(error => {
        logger.error('[Canvas] Background generation failed', {
          generationId: generation.id,
          error,
        });
      });
    });

    return NextResponse.json(
      {
        success: true,
        generationId: generation.id,
        status: generation.status,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    const status =
      message === 'Track not found' || message === 'Release not found'
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
