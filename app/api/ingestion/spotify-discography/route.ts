import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { creatorProfiles } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { enqueueSpotifyDiscographyIngestionJob } from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const requestSchema = z.object({
  creatorProfileId: z.string().uuid(),
  spotifyId: z.string().optional(),
});

function isAuthorized(request: NextRequest): boolean {
  const secret = env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;
  return request.headers.get('x-ingestion-secret') === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { creatorProfileId, spotifyId } = parsed.data;

  try {
    const result = await withSystemIngestionSession(async tx => {
      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          spotifyId: creatorProfiles.spotifyId,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, creatorProfileId))
        .limit(1);

      if (!profile) {
        return { status: 404 as const };
      }

      const effectiveSpotifyId = spotifyId ?? profile.spotifyId;

      if (!effectiveSpotifyId) {
        return { status: 400 as const };
      }

      const jobId = await enqueueSpotifyDiscographyIngestionJob({
        creatorProfileId: profile.id,
        spotifyId: effectiveSpotifyId,
        tx,
      });

      if (jobId) {
        await tx
          .update(creatorProfiles)
          .set({
            ingestionStatus: 'pending',
            lastIngestionError: null,
            updatedAt: new Date(),
          })
          .where(eq(creatorProfiles.id, profile.id));
      }

      return {
        status: 200 as const,
        jobId,
        spotifyId: effectiveSpotifyId,
      };
    });

    if (result.status === 404) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (result.status === 400) {
      return NextResponse.json(
        { error: 'Creator profile is missing a Spotify ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: result.jobId,
        spotifyId: result.spotifyId,
        alreadyQueued: !result.jobId,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Failed to enqueue Spotify discography ingestion job', {
      creatorProfileId,
      spotifyId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to enqueue Spotify discography job' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
