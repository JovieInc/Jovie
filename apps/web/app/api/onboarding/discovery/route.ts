import { and, count, desc, sql as drizzleSql, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogRecordings, discogReleases } from '@/lib/db/schema/content';
import {
  dspArtistMatches,
  socialLinkSuggestions,
} from '@/lib/db/schema/dsp-enrichment';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { buildVisibleReleaseWhereClause } from '@/lib/discography/public-release-visibility';
import { isActiveDiscoveryJob } from '@/lib/discovery/is-active-discovery-job';
import { captureError } from '@/lib/error-tracking';
import {
  buildReadinessState,
  parseSpotifyImportStatus,
} from '@/lib/onboarding/discovery-readiness';
import { getHometownFromSettings } from '@/types/db';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const PROVIDER_LABELS: Record<string, string> = {
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  musicbrainz: 'MusicBrainz',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  tidal: 'Tidal',
  youtube_music: 'YouTube Music',
};

const profileIdSchema = z.string().uuid();

function parseConfidenceScore(
  value: number | string | null | undefined
): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsedProfileId = profileIdSchema.safeParse(profileId);
    if (!parsedProfileId.success) {
      return NextResponse.json(
        { error: 'profileId must be a valid UUID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const validatedProfileId = parsedProfileId.data;

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        bio: creatorProfiles.bio,
        genres: creatorProfiles.genres,
        location: creatorProfiles.location,
        settings: creatorProfiles.settings,
        activeSinceYear: creatorProfiles.activeSinceYear,
        spotifyId: creatorProfiles.spotifyId,
        spotifyUrl: creatorProfiles.spotifyUrl,
        appleMusicId: creatorProfiles.appleMusicId,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        clerkId: users.clerkId,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, validatedProfileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (profile.clerkId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const [
      dspMatches,
      rawSocialLinks,
      pendingSocialSuggestions,
      releaseRows,
      releaseCountResult,
      recordingCountResult,
      activeSocialCountResult,
      latestDiscoveryJob,
    ] = await Promise.all([
      db
        .select({
          id: dspArtistMatches.id,
          providerId: dspArtistMatches.providerId,
          externalArtistId: dspArtistMatches.externalArtistId,
          externalArtistName: dspArtistMatches.externalArtistName,
          externalArtistUrl: dspArtistMatches.externalArtistUrl,
          externalArtistImageUrl: dspArtistMatches.externalArtistImageUrl,
          confidenceScore: dspArtistMatches.confidenceScore,
          status: dspArtistMatches.status,
          updatedAt: dspArtistMatches.updatedAt,
        })
        .from(dspArtistMatches)
        .where(eq(dspArtistMatches.creatorProfileId, validatedProfileId))
        .orderBy(desc(dspArtistMatches.updatedAt)),
      db
        .select({
          id: socialLinks.id,
          platform: socialLinks.platform,
          url: socialLinks.url,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          updatedAt: socialLinks.updatedAt,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, validatedProfileId),
            ne(socialLinks.state, 'rejected')
          )
        )
        .orderBy(desc(socialLinks.updatedAt)),
      db
        .select({
          id: socialLinkSuggestions.id,
          platform: socialLinkSuggestions.platform,
          url: socialLinkSuggestions.url,
          username: socialLinkSuggestions.username,
          sourceProvider: socialLinkSuggestions.sourceProvider,
          confidenceScore: socialLinkSuggestions.confidenceScore,
          status: socialLinkSuggestions.status,
          updatedAt: socialLinkSuggestions.updatedAt,
        })
        .from(socialLinkSuggestions)
        .where(
          and(
            eq(socialLinkSuggestions.creatorProfileId, validatedProfileId),
            eq(socialLinkSuggestions.status, 'pending')
          )
        )
        .orderBy(desc(socialLinkSuggestions.updatedAt)),
      db
        .select({
          id: discogReleases.id,
          title: discogReleases.title,
          artworkUrl: discogReleases.artworkUrl,
          releaseDate: discogReleases.releaseDate,
          spotifyPopularity: discogReleases.spotifyPopularity,
        })
        .from(discogReleases)
        .where(buildVisibleReleaseWhereClause(validatedProfileId))
        .orderBy(
          drizzleSql`COALESCE(${discogReleases.spotifyPopularity}, -1) DESC`,
          drizzleSql`COALESCE(${discogReleases.releaseDate}, ${discogReleases.createdAt}) DESC`,
          desc(discogReleases.createdAt)
        )
        .limit(3),
      db
        .select({ value: count() })
        .from(discogReleases)
        .where(buildVisibleReleaseWhereClause(validatedProfileId)),
      db
        .select({ value: count() })
        .from(discogRecordings)
        .where(eq(discogRecordings.creatorProfileId, validatedProfileId)),
      db
        .select({ value: count() })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, validatedProfileId),
            eq(socialLinks.state, 'active')
          )
        ),
      db
        .select({
          status: ingestionJobs.status,
          createdAt: ingestionJobs.createdAt,
          updatedAt: ingestionJobs.updatedAt,
        })
        .from(ingestionJobs)
        .where(
          and(
            eq(ingestionJobs.jobType, 'dsp_artist_discovery'),
            drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${validatedProfileId}`
          )
        )
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(1),
    ]);

    const socialItems = [
      ...rawSocialLinks.map(link => ({
        id: link.id,
        kind: 'link' as const,
        platform: link.platform,
        platformLabel: PROVIDER_LABELS[link.platform] ?? link.platform,
        url: link.url,
        username: link.displayText,
        source: link.sourcePlatform,
        state: link.state ?? 'active',
        version: link.version,
        confidence: parseConfidenceScore(link.confidence),
      })),
      ...pendingSocialSuggestions.map(link => ({
        id: link.id,
        kind: 'suggestion' as const,
        platform: link.platform,
        platformLabel: PROVIDER_LABELS[link.platform] ?? link.platform,
        url: link.url,
        username: link.username,
        source: link.sourceProvider,
        state: link.status,
        version: null,
        confidence: parseConfidenceScore(link.confidenceScore),
      })),
    ];

    const confirmedDspCount =
      dspMatches.filter(
        match =>
          match.status === 'confirmed' || match.status === 'auto_confirmed'
      ).length + (profile.spotifyId ? 1 : 0);
    const latestMatchUpdatedAt =
      dspMatches.length > 0
        ? dspMatches.reduce<Date | null>(
            (latest, match) =>
              !match.updatedAt || (latest && latest >= match.updatedAt)
                ? latest
                : match.updatedAt,
            null
          )
        : null;
    const hasOnlyTerminalMatches =
      dspMatches.length > 0 &&
      dspMatches.every(
        match =>
          match.status === 'confirmed' ||
          match.status === 'auto_confirmed' ||
          match.status === 'rejected'
      );
    const hasPendingDiscoveryJob = isActiveDiscoveryJob(
      latestDiscoveryJob[0],
      latestMatchUpdatedAt,
      hasOnlyTerminalMatches
    );
    const releaseCount = releaseCountResult[0]?.value ?? 0;
    const recordingCount = recordingCountResult[0]?.value ?? 0;
    const activeSocialCount = activeSocialCountResult[0]?.value ?? 0;
    const hasSpotifySelection = Boolean(
      profile.spotifyId && profile.spotifyUrl
    );
    const spotifyImportStatus = parseSpotifyImportStatus(
      (profile.settings as Record<string, unknown> | null | undefined)
        ?.spotifyImportStatus,
      hasSpotifySelection
    );
    const readiness = buildReadinessState({
      hasPendingDiscoveryJob,
      hasSpotifySelection,
      releaseCount,
      spotifyImportStatus,
    });

    return NextResponse.json(
      {
        success: true,
        snapshot: {
          profile: {
            id: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            bio: profile.bio,
            genres: profile.genres,
            location: profile.location,
            hometown: getHometownFromSettings(profile.settings) ?? null,
            activeSinceYear: profile.activeSinceYear,
            appleMusicConnected: Boolean(profile.appleMusicId),
            onboardingCompletedAt:
              profile.onboardingCompletedAt?.toISOString() ?? null,
          },
          selectedSpotifyProfile:
            profile.spotifyId && profile.spotifyUrl
              ? {
                  id: profile.spotifyId,
                  name: profile.displayName ?? profile.username,
                  url: profile.spotifyUrl,
                  imageUrl: profile.avatarUrl,
                }
              : null,
          dspItems: dspMatches.map(match => ({
            id: match.id,
            providerId: match.providerId,
            providerLabel:
              PROVIDER_LABELS[match.providerId] ?? match.providerId,
            externalArtistId: match.externalArtistId,
            externalArtistName: match.externalArtistName,
            externalArtistUrl: match.externalArtistUrl,
            externalArtistImageUrl: match.externalArtistImageUrl,
            confidenceScore: match.confidenceScore
              ? Number.parseFloat(match.confidenceScore)
              : null,
            status: match.status,
          })),
          socialItems,
          releases: releaseRows.map(release => ({
            id: release.id,
            title: release.title,
            artworkUrl: release.artworkUrl,
            releaseDate: release.releaseDate?.toISOString() ?? null,
            spotifyPopularity: release.spotifyPopularity,
          })),
          counts: {
            releaseCount,
            activeSocialCount,
            dspCount: confirmedDspCount,
          },
          hasPendingDiscoveryJob,
          importState: {
            spotifyImportStatus,
            hasSpotifySelection,
            hasImportedReleases: releaseCount > 0,
            releaseCount,
            recordingCount,
            activeSocialCount,
            confirmedDspCount,
          },
          readiness,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Onboarding discovery fetch failed', error, {
      route: '/api/onboarding/discovery',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
