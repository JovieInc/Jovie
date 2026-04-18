import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { loadReleaseTracksForProfile } from '@/lib/discography/release-track-loader';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  createBulkCanvasGenerations,
  getOwnedReleaseCanvasContext,
  processCanvasGeneration,
} from '@/lib/services/canvas/service';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const requestSchema = z.object({
  releaseId: z.string().uuid(),
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
    const release = await getOwnedReleaseCanvasContext({
      creatorProfileId: profile.id,
      releaseId: parsed.data.releaseId,
    });

    if (!release.artworkUrl) {
      return NextResponse.json(
        { error: 'Upload artwork first before generating a Canvas.' },
        { status: 400 }
      );
    }

    const tracks = await loadReleaseTracksForProfile({
      releaseId: parsed.data.releaseId,
      profileId: profile.id,
      profileHandle: profile.usernameNormalized ?? profile.username ?? '',
    });

    const generations = await createBulkCanvasGenerations({
      creatorProfileId: profile.id,
      releaseId: parsed.data.releaseId,
      tracks: tracks.map(track => ({
        id: track.releaseTrackId ?? track.id,
        releaseTrackId: track.releaseTrackId,
      })),
      artworkUrl: release.artworkUrl,
      releaseTitle: release.title,
      artistName: profile.displayName ?? 'Artist',
      motionPreset: parsed.data.motionPreset,
    });

    after(async () => {
      await Promise.all(
        generations.map(generation =>
          processCanvasGeneration(generation.id).catch(error => {
            logger.error('[Canvas] Bulk background generation failed', {
              generationId: generation.id,
              error,
            });
          })
        )
      );
    });

    return NextResponse.json({
      success: true,
      generationIds: generations.map(generation => generation.id),
      count: generations.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    const status = message === 'Release not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
