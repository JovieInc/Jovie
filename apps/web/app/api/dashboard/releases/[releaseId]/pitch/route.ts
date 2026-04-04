import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { buildPitchInput, generatePitches } from '@/lib/services/pitch';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/** Simple in-memory rate limiter: 10 generations per hour per profile */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(profileId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(profileId);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(profileId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

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

    // Rate limit check
    if (!checkRateLimit(profile.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    const pitchInput = await buildPitchInput(profile.id, releaseId).catch(
      () => null
    );

    if (!pitchInput) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const result = await generatePitches(pitchInput);

    // Save to database
    await db
      .update(discogReleases)
      .set({ generatedPitches: result.pitches })
      .where(eq(discogReleases.id, releaseId));

    return NextResponse.json(result.pitches, { headers: NO_STORE_HEADERS });
  } catch (error) {
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
