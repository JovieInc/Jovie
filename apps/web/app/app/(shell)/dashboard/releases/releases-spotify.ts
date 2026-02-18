'use server';

import { and, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  getReleaseById,
  getTracksForReleaseWithProviders,
} from '@/lib/discography/queries';
import {
  type SpotifyImportResult,
  syncReleasesFromSpotify,
} from '@/lib/discography/spotify-import';
import type { ReleaseViewModel, TrackViewModel } from '@/lib/discography/types';
import { processReleaseEnrichmentJobStandalone } from '@/lib/dsp-enrichment/jobs/release-enrichment';
import { captureError } from '@/lib/error-tracking';
import {
  enqueueDspArtistDiscoveryJob,
  enqueueDspTrackEnrichmentJob,
  enqueueMusicFetchEnrichmentJob,
} from '@/lib/ingestion/jobs';
import {
  checkIsrcRescanRateLimit,
  formatTimeRemaining,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import { getDashboardData } from '../actions';
import {
  buildProviderLabels,
  mapReleaseToViewModel,
  mapTrackToViewModel,
  requireProfile,
} from './releases-shared';

/**
 * Rescan a release's ISRC/UPC codes to discover new DSP links.
 * Runs Apple Music enrichment for the specific release.
 * Rate limited to 1 rescan per 5 minutes per release.
 */
export async function rescanIsrcLinks(params: { releaseId: string }): Promise<{
  release: ReleaseViewModel;
  rateLimited: boolean;
  retryAfter: string | null;
  linksFound: number;
}> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user
  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  // Check rate limit
  const rateLimitResult = await checkIsrcRescanRateLimit(params.releaseId);
  if (!rateLimitResult.success) {
    const providerLabels = buildProviderLabels();
    return {
      release: mapReleaseToViewModel(
        release,
        providerLabels,
        profile.id,
        profile.handle
      ),
      rateLimited: true,
      retryAfter: formatTimeRemaining(rateLimitResult.reset),
      linksFound: 0,
    };
  }

  // Look up the Apple Music match for this profile
  const [match] = await db
    .select({
      id: dspArtistMatches.id,
      externalArtistId: dspArtistMatches.externalArtistId,
      status: dspArtistMatches.status,
    })
    .from(dspArtistMatches)
    .where(
      and(
        eq(dspArtistMatches.creatorProfileId, profile.id),
        eq(dspArtistMatches.providerId, 'apple_music')
      )
    )
    .limit(1);

  let linksFound = 0;

  if (
    match &&
    (match.status === 'confirmed' || match.status === 'auto_confirmed')
  ) {
    // Run enrichment for all unlinked releases (including this one)
    const result = await processReleaseEnrichmentJobStandalone({
      creatorProfileId: profile.id,
      matchId: match.id,
      providerId: 'apple_music',
      externalArtistId: match.externalArtistId,
    });
    linksFound = result.releasesEnriched;
  }

  // Re-fetch the release to get updated provider links
  const updatedRelease = await getReleaseById(params.releaseId);
  if (!updatedRelease) {
    throw new TypeError('Release not found after rescan');
  }

  const providerLabels = buildProviderLabels();

  // Invalidate cache
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  void trackServerEvent('release_isrc_rescan', {
    profileId: profile.id,
    releaseId: params.releaseId,
    linksFound,
  });

  return {
    release: mapReleaseToViewModel(
      updatedRelease,
      providerLabels,
      profile.id,
      profile.handle
    ),
    rateLimited: false,
    retryAfter: null,
    linksFound,
  };
}

/**
 * Sync releases from Spotify
 */
export async function syncFromSpotify(): Promise<{
  success: boolean;
  message: string;
  imported: number;
  errors: string[];
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  if (!profile.spotifyId) {
    return {
      success: false,
      message:
        'No Spotify artist connected. Please connect your Spotify artist profile first.',
      imported: 0,
      errors: ['No Spotify artist ID found on profile'],
    };
  }

  const result: SpotifyImportResult = await syncReleasesFromSpotify(profile.id);

  // Invalidate cache and revalidate path
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  if (result.success) {
    void trackServerEvent('releases_synced', {
      profileId: profile.id,
      imported: result.imported,
      source: 'spotify',
    });

    // Re-trigger DSP artist discovery on resync to pick up new ISRCs
    void enqueueDspArtistDiscoveryJob({
      creatorProfileId: profile.id,
      spotifyArtistId: profile.spotifyId,
      targetProviders: ['apple_music'],
    });

    return {
      success: true,
      message: `Successfully synced ${result.imported} releases from Spotify.`,
      imported: result.imported,
      errors: [],
    };
  }

  return {
    success: false,
    message: result.errors[0] ?? 'Failed to sync releases from Spotify.',
    imported: result.imported,
    errors: result.errors,
  };
}

/**
 * Check if Spotify is connected for the current profile
 */
export async function checkSpotifyConnection(): Promise<{
  connected: boolean;
  spotifyId: string | null;
  artistName: string | null;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    return { connected: false, spotifyId: null, artistName: null };
  }

  try {
    const data = await getDashboardData();

    if (data.needsOnboarding || !data.selectedProfile) {
      return { connected: false, spotifyId: null, artistName: null };
    }

    const settings = data.selectedProfile.settings as Record<
      string,
      unknown
    > | null;
    const artistName = (settings?.spotifyArtistName as string) ?? null;

    return {
      connected: !!data.selectedProfile.spotifyId,
      spotifyId: data.selectedProfile.spotifyId ?? null,
      artistName,
    };
  } catch {
    return { connected: false, spotifyId: null, artistName: null };
  }
}

/**
 * Connect a Spotify artist to the profile and sync releases
 */
export async function connectSpotifyArtist(params: {
  spotifyArtistId: string;
  spotifyArtistUrl: string;
  artistName: string;
}): Promise<{
  success: boolean;
  message: string;
  imported: number;
  releases: ReleaseViewModel[];
  artistName: string;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();
  const providerLabels = buildProviderLabels();

  // Get current settings to merge with new data
  const [currentProfile] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profile.id))
    .limit(1);

  const currentSettings = (currentProfile?.settings ?? {}) as Record<
    string,
    unknown
  >;

  // Update the profile with the Spotify artist ID, URL, and artist name in settings
  await db
    .update(creatorProfiles)
    .set({
      spotifyId: params.spotifyArtistId,
      spotifyUrl: params.spotifyArtistUrl,
      settings: {
        ...currentSettings,
        spotifyArtistName: params.artistName,
      },
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  // Sync releases from the connected artist
  const result: SpotifyImportResult = await syncReleasesFromSpotify(profile.id);

  revalidatePath(APP_ROUTES.RELEASES);

  // Map releases to view models
  const releases = result.releases.map(release =>
    mapReleaseToViewModel(release, providerLabels, profile.id, profile.handle)
  );

  if (result.success) {
    void trackServerEvent('releases_synced', {
      profileId: profile.id,
      imported: result.imported,
      source: 'spotify',
      isInitialConnect: true,
    });

    // Auto-trigger DSP artist discovery (Apple Music matching via ISRCs)
    // Fire-and-forget: don't block the response on discovery
    void enqueueDspArtistDiscoveryJob({
      creatorProfileId: profile.id,
      spotifyArtistId: params.spotifyArtistId,
      targetProviders: ['apple_music'],
    });

    // Auto-trigger MusicFetch enrichment (cross-platform DSP profiles + social links)
    // Fire-and-forget: enrichment runs in background via ingestion job queue
    // Normalize Spotify URL or construct from artist ID
    const normalizedSpotifyUrl = (() => {
      const raw = params.spotifyArtistUrl.trim();
      try {
        const parsed = new URL(raw);
        const hostOk =
          parsed.hostname === 'open.spotify.com' ||
          parsed.hostname === 'spotify.com' ||
          parsed.hostname.endsWith('.spotify.com');
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        if (!hostOk || !parsed.pathname.includes('/artist/')) return null;
        return parsed.toString();
      } catch {
        return null;
      }
    })();

    const spotifyUrlForEnrichment =
      normalizedSpotifyUrl ??
      `https://open.spotify.com/artist/${encodeURIComponent(params.spotifyArtistId)}`;

    void enqueueMusicFetchEnrichmentJob({
      creatorProfileId: profile.id,
      spotifyUrl: spotifyUrlForEnrichment,
    }).catch(error => {
      void captureError('MusicFetch enrichment enqueue failed', error, {
        action: 'connectSpotifyArtist',
        creatorProfileId: profile.id,
      });
      // Enrichment can be retried later; don't fail the connection
    });

    return {
      success: true,
      message: `Connected and synced ${result.imported} releases from Spotify.`,
      imported: result.imported,
      releases,
      artistName: params.artistName,
    };
  }

  return {
    success: false,
    message: result.errors[0] ?? 'Connected but failed to sync releases.',
    imported: 0,
    releases,
    artistName: params.artistName,
  };
}

/**
 * Load tracks for a release (lazy loading for expandable rows)
 */
export async function loadTracksForRelease(params: {
  releaseId: string;
  releaseSlug: string;
}): Promise<TrackViewModel[]> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user's profile
  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const providerLabels = buildProviderLabels();
  const { tracks } = await getTracksForReleaseWithProviders(params.releaseId);

  return tracks.map(track =>
    mapTrackToViewModel(
      track,
      providerLabels,
      profile.handle,
      params.releaseSlug
    )
  );
}

/**
 * Check Apple Music connection status for the current profile
 */
export async function checkAppleMusicConnection(): Promise<{
  connected: boolean;
  artistName: string | null;
  artistId: string | null;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    return { connected: false, artistName: null, artistId: null };
  }

  try {
    const profile = await requireProfile();

    const [match] = await db
      .select({
        externalArtistName: dspArtistMatches.externalArtistName,
        externalArtistId: dspArtistMatches.externalArtistId,
        status: dspArtistMatches.status,
      })
      .from(dspArtistMatches)
      .where(
        and(
          eq(dspArtistMatches.creatorProfileId, profile.id),
          eq(dspArtistMatches.providerId, 'apple_music')
        )
      )
      .limit(1);

    if (!match) {
      return { connected: false, artistName: null, artistId: null };
    }

    const isConnected =
      match.status === 'confirmed' || match.status === 'auto_confirmed';

    return {
      connected: isConnected,
      artistName: isConnected ? match.externalArtistName : null,
      artistId: isConnected ? match.externalArtistId : null,
    };
  } catch {
    return { connected: false, artistName: null, artistId: null };
  }
}

/**
 * Connect an Apple Music artist to the profile manually
 */
export async function connectAppleMusicArtist(params: {
  externalArtistId: string;
  externalArtistName: string;
  externalArtistUrl: string;
  externalArtistImageUrl?: string;
}): Promise<{
  success: boolean;
  message: string;
  artistName: string;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const externalArtistId = params.externalArtistId.trim();
  const externalArtistName = params.externalArtistName.trim();
  const externalArtistUrl = params.externalArtistUrl.trim();

  if (!externalArtistId || !externalArtistName || !externalArtistUrl) {
    throw new TypeError('Apple Music artist data is required');
  }

  let parsedArtistUrl: URL;
  try {
    parsedArtistUrl = new URL(externalArtistUrl);
  } catch {
    throw new TypeError('Invalid Apple Music artist URL');
  }

  if (
    !['http:', 'https:'].includes(parsedArtistUrl.protocol) ||
    !(
      parsedArtistUrl.hostname === 'music.apple.com' ||
      parsedArtistUrl.hostname.endsWith('.music.apple.com')
    ) ||
    !parsedArtistUrl.pathname.includes('/artist/')
  ) {
    throw new TypeError('Invalid Apple Music artist URL');
  }

  const externalArtistImageUrl = params.externalArtistImageUrl?.trim();
  let sanitizedImageUrl: string | null = null;
  if (externalArtistImageUrl) {
    try {
      const parsedImageUrl = new URL(externalArtistImageUrl);
      if (['http:', 'https:'].includes(parsedImageUrl.protocol)) {
        sanitizedImageUrl = parsedImageUrl.toString();
      }
    } catch {
      sanitizedImageUrl = null;
    }
  }

  const profile = await requireProfile();
  const now = new Date();

  let matchId: string | undefined;
  try {
    const [result] = await db
      .insert(dspArtistMatches)
      .values({
        creatorProfileId: profile.id,
        providerId: 'apple_music',
        externalArtistId,
        externalArtistName,
        externalArtistUrl,
        externalArtistImageUrl: sanitizedImageUrl,
        confidenceScore: '1.0000',
        confidenceBreakdown: {
          isrcMatchScore: 0,
          upcMatchScore: 0,
          nameSimilarityScore: 1,
          followerRatioScore: 0,
          genreOverlapScore: 0,
          meta: {
            calculatedAt: now.toISOString(),
            version: 1,
          },
        },
        matchingIsrcCount: 0,
        matchingUpcCount: 0,
        totalTracksChecked: 0,
        status: 'confirmed',
        confirmedAt: now,
        confirmedBy: profile.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          dspArtistMatches.creatorProfileId,
          dspArtistMatches.providerId,
        ],
        set: {
          externalArtistId,
          externalArtistName,
          externalArtistUrl,
          externalArtistImageUrl: sanitizedImageUrl,
          status: 'confirmed',
          confirmedAt: now,
          confirmedBy: profile.id,
          updatedAt: now,
        },
      })
      .returning({ id: dspArtistMatches.id });
    matchId = result?.id;
  } catch (error) {
    await captureError('Apple Music connection save failed', error, {
      action: 'connectAppleMusicArtist',
    });
    return {
      success: false,
      message: 'Failed to save Apple Music connection. Please try again.',
      artistName: externalArtistName,
    };
  }

  // Fire-and-forget: enqueue release enrichment to link Apple Music URLs
  if (matchId) {
    void enqueueDspTrackEnrichmentJob({
      creatorProfileId: profile.id,
      matchId,
      providerId: 'apple_music',
      externalArtistId,
    }).catch(() => {
      // Enrichment can be retried later; don't fail the connection
    });
  }

  revalidatePath(APP_ROUTES.RELEASES);

  return {
    success: true,
    message: `Connected Apple Music as ${externalArtistName}`,
    artistName: externalArtistName,
  };
}
