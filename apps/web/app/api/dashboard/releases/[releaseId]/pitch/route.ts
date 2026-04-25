import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import {
  generateAndSaveReleasePitches,
  ReleasePitchGenerationError,
} from '@/lib/services/pitch/save-generated-pitches';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/**
 * POST /api/dashboard/releases/[releaseId]/pitch
 *
 * Generate AI playlist pitches for a release.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId } = await params;
    const result = await generateAndSaveReleasePitches({
      profileId: profile.id,
      releaseId,
    });

    return NextResponse.json(result.pitches, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ReleasePitchGenerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to generate pitches' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * GET /api/dashboard/releases/[releaseId]/pitch
 *
 * Retrieve existing generated pitches for a release.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId } = await params;

    const [release] = await db
      .select({ generatedPitches: discogReleases.generatedPitches })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.id, releaseId),
          eq(discogReleases.creatorProfileId, profile.id)
        )
      );

    if (!release) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(release.generatedPitches ?? null, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to load pitches' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
