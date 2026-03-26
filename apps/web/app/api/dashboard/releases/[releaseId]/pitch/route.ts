import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  artists,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  recordingArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { PitchInput } from '@/lib/services/pitch';
import { generatePitches } from '@/lib/services/pitch';

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

    // Load release and verify ownership
    const [release] = await db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        releaseDate: discogReleases.releaseDate,
        releaseType: discogReleases.releaseType,
        genres: discogReleases.genres,
        totalTracks: discogReleases.totalTracks,
        label: discogReleases.label,
        distributor: discogReleases.distributor,
        creatorProfileId: discogReleases.creatorProfileId,
      })
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

    // Load artist profile data
    const [artistProfile] = await db
      .select({
        displayName: creatorProfiles.displayName,
        bio: creatorProfiles.bio,
        genres: creatorProfiles.genres,
        location: creatorProfiles.location,
        activeSinceYear: creatorProfiles.activeSinceYear,
        spotifyFollowers: creatorProfiles.spotifyFollowers,
        spotifyPopularity: creatorProfiles.spotifyPopularity,
        pitchContext: creatorProfiles.pitchContext,
        targetPlaylists: creatorProfiles.targetPlaylists,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id));

    // Load tracks with artist credits via recordings
    const trackRows = await db
      .select({
        title: discogReleaseTracks.title,
        durationMs: discogRecordings.durationMs,
        creditName: recordingArtists.creditName,
        artistName: artists.name,
      })
      .from(discogReleaseTracks)
      .innerJoin(
        discogRecordings,
        eq(discogReleaseTracks.recordingId, discogRecordings.id)
      )
      .leftJoin(
        recordingArtists,
        eq(recordingArtists.recordingId, discogRecordings.id)
      )
      .leftJoin(artists, eq(artists.id, recordingArtists.artistId))
      .where(eq(discogReleaseTracks.releaseId, releaseId));

    // Group credits by track
    const trackMap = new Map<
      string,
      { title: string; durationMs: number | null; creditNames: string[] }
    >();
    for (const row of trackRows) {
      const existing = trackMap.get(row.title);
      const creditName = row.creditName ?? row.artistName;
      if (existing) {
        if (creditName && !existing.creditNames.includes(creditName)) {
          existing.creditNames.push(creditName);
        }
      } else {
        trackMap.set(row.title, {
          title: row.title,
          durationMs: row.durationMs,
          creditNames: creditName ? [creditName] : [],
        });
      }
    }

    const pitchInput: PitchInput = {
      artist: {
        displayName: artistProfile?.displayName ?? null,
        bio: artistProfile?.bio ?? null,
        genres: artistProfile?.genres ?? null,
        location: artistProfile?.location ?? null,
        activeSinceYear: artistProfile?.activeSinceYear ?? null,
        spotifyFollowers: artistProfile?.spotifyFollowers ?? null,
        spotifyPopularity: artistProfile?.spotifyPopularity ?? null,
        pitchContext: artistProfile?.pitchContext ?? null,
        targetPlaylists: artistProfile?.targetPlaylists ?? null,
      },
      release: {
        title: release.title,
        releaseDate: release.releaseDate,
        releaseType: release.releaseType,
        genres: release.genres,
        totalTracks: release.totalTracks,
        label: release.label,
        distributor: release.distributor,
      },
      tracks: Array.from(trackMap.values()),
    };

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
