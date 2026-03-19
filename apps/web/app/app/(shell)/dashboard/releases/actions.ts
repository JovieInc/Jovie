'use server';

import { and, count, eq, ne } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { discogReleases } from '@/lib/db/schema/content';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { validateProviderUrl } from '@/lib/discography/provider-domains';
import {
  getProviderLink,
  getReleaseById,
  getReleasesForProfile as getReleasesFromDb,
  type ReleaseWithProviders,
  resetProviderLink as resetProviderLinkDb,
  upsertProviderLink,
} from '@/lib/discography/queries';
import { loadReleaseTracksForProfile } from '@/lib/discography/release-track-loader';
import {
  type SpotifyImportResult,
  syncReleasesFromSpotify,
} from '@/lib/discography/spotify-import';
import type {
  ProviderKey,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { VIDEO_PROVIDER_KEYS } from '@/lib/discography/video-providers';
import {
  buildProviderLabels,
  mapProviderLinksToViewModel,
} from '@/lib/discography/view-models';
import { processReleaseEnrichmentJobStandalone } from '@/lib/dsp-enrichment/jobs/release-enrichment';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import {
  enqueueDspArtistDiscoveryJob,
  enqueueDspTrackEnrichmentJob,
  enqueueMusicFetchEnrichmentJob,
} from '@/lib/ingestion/jobs';
import type { LyricsFormat } from '@/lib/lyrics';
import { formatLyrics } from '@/lib/lyrics';
import {
  checkAppleMusicRescanRateLimit,
  checkIsrcRescanRateLimit,
  checkReleaseRefreshRateLimit,
  formatTimeRemaining,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import {
  buildCanvasMetadata,
  getCanvasStatusFromMetadata,
} from '@/lib/services/canvas/service';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { slugify } from '@/lib/utils';
import { toISOStringOrNull } from '@/lib/utils/date';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';

const SPOTIFY_ALREADY_CLAIMED_MESSAGE =
  'This Spotify artist is already linked to another Jovie account. Please sign in with the original account or choose a different artist.';

function isSpotifyIdUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error, 'creator_profiles_spotify_id_unique');
}

function normalizeSpotifyArtistUrl(rawUrl: string, spotifyArtistId: string) {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return `https://open.spotify.com/artist/${encodeURIComponent(spotifyArtistId)}`;
  }

  try {
    const parsed = new URL(trimmedUrl);
    const hostOk =
      parsed.hostname === 'open.spotify.com' ||
      parsed.hostname === 'spotify.com' ||
      parsed.hostname.endsWith('.spotify.com');
    const protocolOk = ['http:', 'https:'].includes(parsed.protocol);
    const pathOk = parsed.pathname.includes('/artist/');

    if (protocolOk && hostOk && pathOk) {
      return parsed.toString();
    }
  } catch {
    // Fall back to canonical Spotify artist URL below.
  }

  return `https://open.spotify.com/artist/${encodeURIComponent(spotifyArtistId)}`;
}

function deriveSpotifyImportStatus(result: SpotifyImportResult) {
  if (result.success || result.releases.length > 0 || result.imported > 0) {
    return 'complete' as const;
  }

  return 'failed' as const;
}

async function requireProfile(profileId?: string): Promise<{
  id: string;
  spotifyId: string | null;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect('/onboarding');
  }

  let profile = data.selectedProfile;

  // If a specific profile is requested, ensure the user owns it
  if (profileId) {
    profile = data.creatorProfiles.find(p => p.id === profileId) ?? null;
  }

  // Redirect to onboarding if no profile exists (new users, mid-onboarding, or load errors)
  if (!profile) {
    redirect('/onboarding');
  }

  return {
    id: profile.id,
    spotifyId: profile.spotifyId ?? null,
    handle: profile.usernameNormalized ?? profile.username,
  };
}

/**
 * Extract genres from release metadata
 */
function extractGenres(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];

  // Try common genre field names from various sources
  const genreField =
    metadata.genres ??
    metadata.genre ??
    metadata.spotifyGenres ??
    metadata.spotify_genres;

  if (Array.isArray(genreField)) {
    return genreField.filter((g): g is string => typeof g === 'string');
  }

  if (typeof genreField === 'string') {
    return [genreField];
  }

  return [];
}

/**
 * Map database release to view model
 */
function mapReleaseToViewModel(
  release: ReleaseWithProviders,
  _providerLabels: Record<ProviderKey, string>,
  profileId: string,
  profileHandle: string
): ReleaseViewModel {
  // Use the new short URL format: /{handle}/{slug}
  const slug = release.slug;

  return {
    profileId,
    id: release.id,
    title: release.title,
    artistNames: release.artistNames,
    releaseDate: toISOStringOrNull(release.releaseDate) ?? undefined,
    artworkUrl: release.artworkUrl ?? undefined,
    slug,
    smartLinkPath: buildSmartLinkPath(profileHandle, slug),
    spotifyPopularity: release.spotifyPopularity,
    providers: mapProviderLinksToViewModel({
      providerLinks: release.providerLinks,
      profileHandle,
      slug,
    }),
    // Extended fields
    releaseType: release.releaseType,
    isExplicit: release.isExplicit,
    upc: release.upc,
    label: release.label,
    totalTracks: release.totalTracks,
    totalDurationMs: release.trackSummary?.totalDurationMs ?? null,
    primaryIsrc: release.trackSummary?.primaryIsrc ?? null,
    genres:
      release.genres && release.genres.length > 0
        ? release.genres
        : extractGenres(release.metadata),
    copyrightLine: release.copyrightLine ?? null,
    distributor: release.distributor ?? null,
    canvasStatus: getCanvasStatusFromMetadata(release.metadata),
    originalArtworkUrl: (release.metadata as Record<string, unknown> | null)
      ?.originalArtworkUrl as string | undefined,
    hasVideoLinks: release.providerLinks.some(link =>
      (VIDEO_PROVIDER_KEYS as string[]).includes(link.providerId)
    ),
    lyrics:
      (
        release.metadata as Record<string, unknown> | null
      )?.lyrics?.toString() || undefined,
  };
}

/**
 * Core release matrix fetch logic (cacheable)
 */
async function fetchReleaseMatrixCore(
  profileId: string,
  profileHandle: string
): Promise<ReleaseViewModel[]> {
  const providerLabels = buildProviderLabels();
  const releases = await getReleasesFromDb(profileId);

  return releases.map(release =>
    mapReleaseToViewModel(release, providerLabels, profileId, profileHandle)
  );
}

/**
 * Core release matrix loading logic (cacheable).
 * Cache is invalidated on mutations (save/reset provider links, Spotify sync)
 */
async function resolveReleaseMatrix(
  profileId?: string
): Promise<ReleaseViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.RELEASES}`);
  }

  const profile = await requireProfile(profileId);

  // Cache with 30s TTL and tags for invalidation
  return unstable_cache(
    () => fetchReleaseMatrixCore(profile.id, profile.handle),
    ['releases-matrix', userId, profile.id],
    {
      revalidate: 30,
      tags: [`releases:${userId}:${profile.id}`],
    }
  )();
}

/**
 * Cached loader for release matrix.
 * Uses React's cache() for request-level deduplication.
 */
export const loadReleaseMatrix = cache(resolveReleaseMatrix);

export async function saveProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
  url: string;
}): Promise<ReleaseViewModel> {
  noStore();

  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      throw new Error('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new TypeError('Profile mismatch');
    }

    const trimmedUrl = params.url?.trim() ?? '';
    if (!trimmedUrl) {
      throw new TypeError('URL is required');
    }

    // Validate URL format and provider domain
    const providerLabel = PROVIDER_CONFIG[params.provider]?.label;
    const validation = validateProviderUrl(
      trimmedUrl,
      params.provider,
      providerLabel
    );
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new TypeError('Invalid provider');
    }

    // Save the provider link override
    await upsertProviderLink({
      releaseId: params.releaseId,
      providerId: params.provider,
      url: trimmedUrl,
      sourceType: 'manual',
    });

    // Fetch the updated release
    const release = await getReleaseById(params.releaseId);
    if (!release) {
      throw new TypeError('Release not found');
    }

    const providerLabels = buildProviderLabels();

    // Invalidate cache tag so next server fetch returns fresh data
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');

    revalidateTag(createSmartLinkContentTag(profile.id), 'max');
    // Skip revalidatePath — the mutation hook handles cache updates via TanStack
    // Query, and a path revalidation resets client-side state (closing the sidebar).

    return mapReleaseToViewModel(
      release,
      providerLabels,
      profile.id,
      profile.handle
    );
  } catch (error) {
    // Re-throw with user-friendly message
    const message =
      error instanceof Error ? error.message : 'Failed to save provider link';
    throw new Error(message);
  }
}

export async function resetProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
}): Promise<ReleaseViewModel> {
  noStore();

  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      throw new Error('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new TypeError('Profile mismatch');
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new TypeError('Invalid provider');
    }

    // Get the current provider link to check for ingested URL
    const existingLink = await getProviderLink(
      params.releaseId,
      params.provider
    );

    // Get the ingested URL from metadata if available
    const ingestedUrl =
      existingLink?.sourceType === 'ingested' ? existingLink.url : undefined;

    // Reset the provider link
    await resetProviderLinkDb(params.releaseId, params.provider, ingestedUrl);

    // Fetch the updated release
    const release = await getReleaseById(params.releaseId);
    if (!release) {
      throw new TypeError('Release not found');
    }

    const providerLabels = buildProviderLabels();

    // Invalidate cache tag so next server fetch returns fresh data
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');

    revalidateTag(createSmartLinkContentTag(profile.id), 'max');
    // Skip revalidatePath — the mutation hook handles cache updates via TanStack
    // Query, and a path revalidation resets client-side state (closing the sidebar).

    return mapReleaseToViewModel(
      release,
      providerLabels,
      profile.id,
      profile.handle
    );
  } catch (error) {
    // Re-throw with user-friendly message
    const message =
      error instanceof Error ? error.message : 'Failed to reset provider link';
    throw new Error(message);
  }
}

export async function saveReleaseLyrics(params: {
  profileId: string;
  releaseId: string;
  lyrics: string;
}): Promise<ReleaseViewModel> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();
  if (profile.id !== params.profileId) {
    throw new TypeError('Profile mismatch');
  }

  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const metadata = (release.metadata as Record<string, unknown> | null) ?? {};

  await db
    .update(discogReleases)
    .set({
      metadata: { ...metadata, lyrics: params.lyrics },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discogReleases.id, params.releaseId),
        eq(discogReleases.creatorProfileId, profile.id)
      )
    );

  const updated = await getReleaseById(params.releaseId);
  if (!updated) {
    throw new TypeError('Release not found');
  }

  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  // Skip revalidatePath — the mutation hook handles cache updates via TanStack
  // Query, and a path revalidation resets client-side state (closing the sidebar).

  return mapReleaseToViewModel(
    updated,
    buildProviderLabels(),
    profile.id,
    profile.handle
  );
}

export async function saveCanvasStatus(params: {
  profileId: string;
  releaseId: string;
  status: CanvasStatus;
}): Promise<ReleaseViewModel> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();
  if (profile.id !== params.profileId) {
    throw new TypeError('Profile mismatch');
  }

  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const metadata = (release.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    ...buildCanvasMetadata(params.status),
  };

  if (params.status === 'not_set') {
    delete nextMetadata.canvasVideoUrl;
  }

  await db
    .update(discogReleases)
    .set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discogReleases.id, params.releaseId),
        eq(discogReleases.creatorProfileId, profile.id)
      )
    );

  const updated = await getReleaseById(params.releaseId);
  if (!updated) {
    throw new TypeError('Release not found');
  }

  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  // Skip revalidatePath — the mutation hook handles cache updates via TanStack
  // Query, and a path revalidation resets client-side state (closing the sidebar).

  return mapReleaseToViewModel(
    updated,
    buildProviderLabels(),
    profile.id,
    profile.handle
  );
}

export async function formatReleaseLyrics(params: {
  profileId: string;
  releaseId: string;
  lyrics: string;
  format?: LyricsFormat;
}): Promise<{ release: ReleaseViewModel; changesSummary: string[] }> {
  const { formatted, changesSummary } = formatLyrics(
    params.lyrics,
    params.format ?? 'apple-music'
  );
  const release = await saveReleaseLyrics({
    profileId: params.profileId,
    releaseId: params.releaseId,
    lyrics: formatted,
  });

  return { release, changesSummary };
}

/**
 * Refresh a single release from the database.
 * Re-fetches the release data (including provider links) without hitting Spotify API.
 * Rate limited: free 1/day, paid 1/hour per release.
 */
export async function refreshRelease(params: { releaseId: string }): Promise<{
  release: ReleaseViewModel;
  rateLimited: boolean;
  retryAfter: string | null;
}> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  // Check rate limit (plan-aware)
  let plan: string | null = null;
  try {
    const ent = await getCurrentUserEntitlements();
    plan = ent.plan;
  } catch {
    // Default to free tier on billing errors
  }

  const rateLimitResult = await checkReleaseRefreshRateLimit(
    params.releaseId,
    plan
  );

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
    };
  }

  if (profile.spotifyId) {
    // Trigger a fresh Spotify sync and MusicFetch enrichment so refresh actions
    // re-ingest live upstream data instead of only returning cached DB rows.
    await syncReleasesFromSpotify(profile.id);

    void Promise.resolve(
      enqueueMusicFetchEnrichmentJob({
        creatorProfileId: profile.id,
        spotifyUrl: `https://open.spotify.com/artist/${encodeURIComponent(profile.spotifyId)}`,
      })
    ).catch(error => {
      void captureError(
        'MusicFetch enrichment enqueue failed on refresh',
        error,
        {
          action: 'refreshRelease',
          creatorProfileId: profile.id,
          releaseId: params.releaseId,
        }
      );
    });
  }

  const refreshedRelease = await getReleaseById(params.releaseId);
  const providerLabels = buildProviderLabels();

  return {
    release: mapReleaseToViewModel(
      refreshedRelease ?? release,
      providerLabels,
      profile.id,
      profile.handle
    ),
    rateLimited: false,
    retryAfter: null,
  };
}

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
    throw new Error('Unauthorized');
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

  // Invalidate cache tag so next server fetch returns fresh data
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  // Skip revalidatePath — the mutation hook handles cache updates via TanStack
  // Query, and a path revalidation resets client-side state (closing the sidebar).

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
 * Rescan Apple Music links across all releases for the current profile.
 * Rate limited: free 1/day, paid 1/hour per profile.
 */
export async function rescanAppleMusicLinks(): Promise<{
  success: boolean;
  rateLimited: boolean;
  retryAfter: string | null;
  linksFound: number;
  message: string;
}> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Check rate limit (plan-aware)
  let plan: string | null = null;
  try {
    const ent = await getCurrentUserEntitlements();
    plan = ent.plan;
  } catch {
    // Default to free tier on billing errors
  }

  const rateLimitResult = await checkAppleMusicRescanRateLimit(
    profile.id,
    plan
  );

  if (!rateLimitResult.success) {
    return {
      success: false,
      rateLimited: true,
      retryAfter: formatTimeRemaining(rateLimitResult.reset),
      linksFound: 0,
      message: `Apple Music refresh is rate limited. Try again in ${formatTimeRemaining(rateLimitResult.reset)}.`,
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

  if (
    !match ||
    (match.status !== 'confirmed' && match.status !== 'auto_confirmed')
  ) {
    return {
      success: false,
      rateLimited: false,
      retryAfter: null,
      linksFound: 0,
      message: 'No Apple Music artist connected.',
    };
  }

  const result = await processReleaseEnrichmentJobStandalone({
    creatorProfileId: profile.id,
    matchId: match.id,
    providerId: 'apple_music',
    externalArtistId: match.externalArtistId,
  });

  // Invalidate cache
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  void trackServerEvent('apple_music_rescan', {
    profileId: profile.id,
    linksFound: result.releasesEnriched,
  });

  return {
    success: true,
    rateLimited: false,
    retryAfter: null,
    linksFound: result.releasesEnriched,
    message: (() => {
      if (result.releasesEnriched === 0)
        return 'No new Apple Music links found.';
      const suffix = result.releasesEnriched === 1 ? '' : 's';
      return `Found ${result.releasesEnriched} new Apple Music link${suffix}.`;
    })(),
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
    throw new Error('Unauthorized');
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

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
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
      targetProviders: ['apple_music', 'deezer', 'musicbrainz'],
    }).catch(error => {
      void captureError('DSP artist discovery enqueue failed on sync', error, {
        action: 'syncFromSpotify',
        creatorProfileId: profile.id,
      });
    });

    // Re-trigger MusicFetch enrichment to discover cross-platform DSP profiles
    // This populates Deezer, Tidal, SoundCloud, YouTube Music IDs on the profile
    void Promise.resolve(
      enqueueMusicFetchEnrichmentJob({
        creatorProfileId: profile.id,
        spotifyUrl: `https://open.spotify.com/artist/${encodeURIComponent(profile.spotifyId)}`,
      })
    ).catch(error => {
      void captureError('MusicFetch enrichment enqueue failed on sync', error, {
        action: 'syncFromSpotify',
        creatorProfileId: profile.id,
      });
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

    const profile = data.selectedProfile;
    const settings = profile.settings as Record<string, unknown> | null;
    const artistName = (settings?.spotifyArtistName as string) ?? null;

    // Primary check: profile.spotifyId (set when user explicitly connects Spotify)
    if (profile.spotifyId) {
      return { connected: true, spotifyId: profile.spotifyId, artistName };
    }

    // If the Spotify import is still in progress (e.g., user just finished
    // onboarding and the async connectSpotifyArtist hasn't written spotifyId
    // yet), treat it as connected so we don't show the empty "Connect Spotify"
    // state. The import banner will show instead.
    const spotifyImportStatus =
      typeof settings?.spotifyImportStatus === 'string'
        ? settings.spotifyImportStatus
        : null;
    if (
      artistName &&
      (spotifyImportStatus === 'importing' ||
        spotifyImportStatus === 'complete')
    ) {
      return { connected: true, spotifyId: null, artistName };
    }

    // Diagnostic: spotifyArtistName in settings but no spotifyId indicates
    // a state inconsistency — the user previously connected but the ID is missing.
    if (artistName) {
      void captureError(
        '[checkSpotifyConnection] Spotify state inconsistency: artistName set but spotifyId is null',
        new Error('Spotify state inconsistency'),
        {
          profileId: profile.id,
          artistName,
          spotifyImportStatus: spotifyImportStatus ?? 'none',
        }
      );
    }

    // Fallback: check dspArtistMatches for a confirmed Spotify match.
    // Keeps this consistent with ConnectedDspList which checks both sources.
    const [spotifyMatch] = await db
      .select({
        externalArtistId: dspArtistMatches.externalArtistId,
        externalArtistName: dspArtistMatches.externalArtistName,
        status: dspArtistMatches.status,
      })
      .from(dspArtistMatches)
      .where(
        and(
          eq(dspArtistMatches.creatorProfileId, profile.id),
          eq(dspArtistMatches.providerId, 'spotify')
        )
      )
      .limit(1);

    if (
      spotifyMatch &&
      (spotifyMatch.status === 'confirmed' ||
        spotifyMatch.status === 'auto_confirmed')
    ) {
      return {
        connected: true,
        spotifyId: spotifyMatch.externalArtistId,
        artistName: spotifyMatch.externalArtistName ?? artistName,
      };
    }

    return { connected: false, spotifyId: null, artistName };
  } catch (error) {
    throwIfRedirect(error);
    return { connected: false, spotifyId: null, artistName: null };
  }
}

/**
 * Connect a Spotify artist to the profile and sync releases
 */
/**
 * Poll current release count and release data (uncached, for real-time import progress).
 */
export async function pollReleasesCount(): Promise<{
  count: number;
  releases: ReleaseViewModel[];
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) throw new Error('Unauthorized');

  const profile = await requireProfile();
  const providerLabels = buildProviderLabels();
  const releases = await getReleasesFromDb(profile.id);

  return {
    count: releases.length,
    releases: releases.map(r =>
      mapReleaseToViewModel(r, providerLabels, profile.id, profile.handle)
    ),
  };
}

/**
 * Get Spotify import status from profile settings (uncached).
 */
export async function getSpotifyImportStatus(): Promise<{
  status: 'idle' | 'importing' | 'complete' | 'failed';
  releaseCount: number;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) throw new Error('Unauthorized');

  const profile = await requireProfile();

  const [row] = await db
    .select({
      settings: creatorProfiles.settings,
      spotifyId: creatorProfiles.spotifyId,
      releaseCount: count(discogReleases.id),
    })
    .from(creatorProfiles)
    .leftJoin(
      discogReleases,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(eq(creatorProfiles.id, profile.id))
    .groupBy(creatorProfiles.id)
    .limit(1);

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const storedStatus = settings.spotifyImportStatus as string | undefined;
  const releaseCount = Number(row?.releaseCount ?? 0);
  const hasSpotifyProfile = Boolean(row?.spotifyId);

  let status: 'idle' | 'importing' | 'complete' | 'failed';
  if (storedStatus === 'complete') {
    status = 'complete';
  } else if (storedStatus === 'failed') {
    status = 'failed';
  } else if (storedStatus === 'importing') {
    status = hasSpotifyProfile && releaseCount > 0 ? 'complete' : 'importing';
  } else {
    status = hasSpotifyProfile && releaseCount > 0 ? 'complete' : 'idle';
  }

  return { status, releaseCount };
}

export async function connectSpotifyArtist(params: {
  spotifyArtistId: string;
  spotifyArtistUrl: string;
  artistName: string;
  includeTracks?: boolean;
  skipMusicFetchEnrichment?: boolean;
}): Promise<{
  success: boolean;
  importing: boolean;
  message: string;
  imported: number;
  releases: ReleaseViewModel[];
  artistName: string;
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

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
  const shouldRunInlineImport = process.env.E2E_FAST_ONBOARDING === '1';

  // Pre-check: detect if another profile already claims this Spotify artist ID.
  // This gives a clean error path for the common case; the catch block below
  // remains as a safety net for rare concurrent-write races.
  const [existingClaim] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, params.spotifyArtistId),
        ne(creatorProfiles.id, profile.id)
      )
    )
    .limit(1);

  if (existingClaim) {
    return {
      success: false,
      importing: false,
      message: SPOTIFY_ALREADY_CLAIMED_MESSAGE,
      imported: 0,
      releases: [],
      artistName: params.artistName,
    };
  }

  // Update the profile with Spotify ID and mark import as in-progress
  try {
    await db
      .update(creatorProfiles)
      .set({
        spotifyId: params.spotifyArtistId,
        spotifyUrl: params.spotifyArtistUrl,
        settings: {
          ...currentSettings,
          spotifyArtistName: params.artistName,
          spotifyImportStatus: 'importing',
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));
  } catch (error) {
    if (isSpotifyIdUniqueViolation(error)) {
      return {
        success: false,
        importing: false,
        message: SPOTIFY_ALREADY_CLAIMED_MESSAGE,
        imported: 0,
        releases: [],
        artistName: params.artistName,
      };
    }

    throw error;
  }

  const finalizeSpotifyImport = async (
    result: SpotifyImportResult
  ): Promise<void> => {
    const spotifyImportStatus = deriveSpotifyImportStatus(result);

    // Update import status and re-assert the canonical Spotify identity fields.
    // The import itself is async and can overlap with other profile writes during
    // onboarding; writing these fields again keeps the profile aligned with the
    // imported release data even if an intermediate update raced with the connect.
    const [latest] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);
    const latestSettings = (latest?.settings ?? {}) as Record<string, unknown>;

    await db
      .update(creatorProfiles)
      .set({
        spotifyId: params.spotifyArtistId,
        spotifyUrl: normalizeSpotifyArtistUrl(
          params.spotifyArtistUrl,
          params.spotifyArtistId
        ),
        settings: {
          ...latestSettings,
          spotifyArtistName:
            params.artistName || (latestSettings.spotifyArtistName as string),
          spotifyImportStatus,
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    revalidateTag(`releases:${userId}:${profile.id}`, 'max');

    revalidateTag(createSmartLinkContentTag(profile.id), 'max');
    revalidatePath(APP_ROUTES.RELEASES);

    if (result.success) {
      void trackServerEvent('releases_synced', {
        profileId: profile.id,
        imported: result.imported,
        source: 'spotify',
        isInitialConnect: true,
      });

      // Auto-trigger DSP artist discovery
      void enqueueDspArtistDiscoveryJob({
        creatorProfileId: profile.id,
        spotifyArtistId: params.spotifyArtistId,
        targetProviders: ['apple_music', 'deezer', 'musicbrainz'],
      }).catch(err => {
        void captureError(
          'DSP artist discovery enqueue failed on connect',
          err,
          { action: 'connectSpotifyArtist', creatorProfileId: profile.id }
        );
      });

      // Auto-trigger MusicFetch enrichment
      if (!params.skipMusicFetchEnrichment) {
        const spotifyUrlForEnrichment = normalizeSpotifyArtistUrl(
          params.spotifyArtistUrl,
          params.spotifyArtistId
        );

        void enqueueMusicFetchEnrichmentJob({
          creatorProfileId: profile.id,
          spotifyUrl: spotifyUrlForEnrichment,
        }).catch(err => {
          void captureError('MusicFetch enrichment enqueue failed', err, {
            action: 'connectSpotifyArtist',
            creatorProfileId: profile.id,
          });
        });
      }
    }
  };

  const runSpotifyImport = async (): Promise<SpotifyImportResult> => {
    return syncReleasesFromSpotify(profile.id, {
      includeTracks: params.includeTracks ?? true,
    });
  };

  if (shouldRunInlineImport) {
    try {
      const result = await runSpotifyImport();
      await finalizeSpotifyImport(result);

      return {
        success: result.success,
        importing: false,
        message: result.success
          ? 'Imported releases from Spotify.'
          : 'Spotify import finished with errors.',
        imported: result.imported,
        releases: result.releases.map(release =>
          mapReleaseToViewModel(
            release,
            buildProviderLabels(),
            profile.id,
            profile.handle
          )
        ),
        artistName: params.artistName,
      };
    } catch (error) {
      // Mark import as failed on unexpected error
      try {
        const [latest] = await db
          .select({ settings: creatorProfiles.settings })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, profile.id))
          .limit(1);
        const latestSettings = (latest?.settings ?? {}) as Record<
          string,
          unknown
        >;

        await db
          .update(creatorProfiles)
          .set({
            settings: { ...latestSettings, spotifyImportStatus: 'failed' },
            updatedAt: new Date(),
          })
          .where(eq(creatorProfiles.id, profile.id));
      } catch {
        // DB update best-effort in error path
      }

      void captureError('Background Spotify import failed', error, {
        action: 'connectSpotifyArtist',
        creatorProfileId: profile.id,
      });

      return {
        success: false,
        importing: false,
        message: 'Spotify import failed.',
        imported: 0,
        releases: [],
        artistName: params.artistName,
      };
    }
  }

  // Fire-and-forget: start import in background, return immediately
  void (async () => {
    try {
      const result = await runSpotifyImport();
      await finalizeSpotifyImport(result);
    } catch (error) {
      // Mark import as failed on unexpected error
      try {
        const [latest] = await db
          .select({ settings: creatorProfiles.settings })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, profile.id))
          .limit(1);
        const latestSettings = (latest?.settings ?? {}) as Record<
          string,
          unknown
        >;

        await db
          .update(creatorProfiles)
          .set({
            settings: { ...latestSettings, spotifyImportStatus: 'failed' },
            updatedAt: new Date(),
          })
          .where(eq(creatorProfiles.id, profile.id));
      } catch {
        // DB update best-effort in error path
      }

      void captureError('Background Spotify import failed', error, {
        action: 'connectSpotifyArtist',
        creatorProfileId: profile.id,
      });
    }
  })();

  return {
    success: true,
    importing: true,
    message: 'Importing releases from Spotify...',
    imported: 0,
    releases: [],
    artistName: params.artistName,
  };
}

/**
 * Load tracks for a release (lazy loading for expandable rows)
 */
export async function loadTracksForRelease(params: {
  releaseId: string;
  releaseSlug?: string;
}): Promise<TrackViewModel[]> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  return loadReleaseTracksForProfile({
    releaseId: params.releaseId,
    profileId: profile.id,
    profileHandle: profile.handle,
  });
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
    const data = await getDashboardData();

    if (data.needsOnboarding || !data.selectedProfile) {
      return { connected: false, artistName: null, artistId: null };
    }

    const profile = data.selectedProfile;

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

    if (
      match &&
      (match.status === 'confirmed' || match.status === 'auto_confirmed')
    ) {
      return {
        connected: true,
        artistName: match.externalArtistName,
        artistId: match.externalArtistId,
      };
    }

    // Fallback: check profile.appleMusicId (set when connected directly).
    // Keeps this consistent with ConnectedDspList which checks both sources.
    if (profile.appleMusicId) {
      return {
        connected: true,
        artistName: null,
        artistId: profile.appleMusicId,
      };
    }

    return { connected: false, artistName: null, artistId: null };
  } catch (error) {
    throwIfRedirect(error);
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
    throw new Error('Unauthorized');
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

interface DeleteReleaseParams {
  releaseId: string;
}

/**
 * Delete a release and all associated data (tracks, provider links, etc.).
 * Cascading deletes handle child records automatically.
 */
export async function deleteRelease(
  params: DeleteReleaseParams
): Promise<{ success: boolean }> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user's profile
  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  await db
    .delete(discogReleases)
    .where(eq(discogReleases.id, params.releaseId));

  // Invalidate cache and revalidate path
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  void trackServerEvent('release_deleted', {
    profileId: profile.id,
    releaseId: params.releaseId,
    releaseTitle: release.title,
  });

  return { success: true };
}

/**
 * Upload release artwork via the artwork upload API.
 * Returns the new artwork URL after processing and storage.
 */
export async function uploadReleaseArtwork(
  releaseId: string,
  file: File
): Promise<{ artworkUrl: string; sizes: Record<string, string> }> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user
  const release = await getReleaseById(releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  // Build FormData and call the artwork upload API
  const formData = new FormData();
  formData.append('file', file);

  const { publicEnv } = await import('@/lib/env-public');
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  const response = await fetch(
    `${baseUrl}/api/images/artwork/upload?releaseId=${encodeURIComponent(releaseId)}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message ?? 'Failed to upload artwork');
  }

  const result = await response.json();

  // Invalidate cache tag so next server fetch returns fresh data
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  // Skip revalidatePath — the client handles cache updates via onReleaseChange,
  // and a path revalidation resets client-side state (closing the sidebar).

  return {
    artworkUrl: result.artworkUrl,
    sizes: result.sizes,
  };
}

/**
 * Update the "allow artwork downloads" setting for a creator profile.
 * Stored in the profile's settings JSONB field.
 */
export async function updateAllowArtworkDownloads(
  allowDownloads: boolean
): Promise<void> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  try {
    const [currentProfile] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);

    const currentSettings = (currentProfile?.settings ?? {}) as Record<
      string,
      unknown
    >;

    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...currentSettings,
          allowArtworkDownloads: allowDownloads,
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));
  } catch (error) {
    throw new Error('Failed to update artwork download setting', {
      cause: error,
    });
  }

  // Skip revalidatePath — this setting lives on the creator profile, not on
  // releases. The component already does an optimistic update, and a path
  // revalidation here would reset client-side state (e.g. closing the sidebar).
}

/**
 * Revert release artwork to the original DSP-ingested artwork.
 * Restores artworkUrl and artworkSizes from the saved originals in metadata.
 */
export async function revertReleaseArtwork(
  releaseId: string
): Promise<{ artworkUrl: string; originalArtworkUrl: string }> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  const release = await getReleaseById(releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const metadata = (release.metadata as Record<string, unknown>) ?? {};
  const originalArtworkUrl = metadata.originalArtworkUrl as string | undefined;

  if (!originalArtworkUrl) {
    throw new Error('No original artwork to revert to');
  }

  const originalArtworkSizes = metadata.originalArtworkSizes as
    | Record<string, string>
    | undefined;

  await db
    .update(discogReleases)
    .set({
      artworkUrl: originalArtworkUrl,
      metadata: {
        ...metadata,
        artworkSizes: originalArtworkSizes ?? {},
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, releaseId));

  revalidateTag(`releases:${userId}:${profile.id}`, 'max');

  revalidateTag(createSmartLinkContentTag(profile.id), 'max');
  // Skip revalidatePath — the client handles cache updates via onReleaseChange,
  // and a path revalidation resets client-side state (closing the sidebar).

  return { artworkUrl: originalArtworkUrl, originalArtworkUrl };
}

async function upsertReleaseProviderUrls(
  releaseId: string,
  providerUrls: Record<string, string>
): Promise<void> {
  const providerLabels = buildProviderLabels();
  const entries = Object.entries(providerUrls).filter(
    ([, url]) => url.trim().length > 0
  );
  for (const [key, url] of entries) {
    const provider = key as ProviderKey;
    const providerLabel = providerLabels[provider];
    if (!providerLabel) continue;
    const trimmedUrl = url.trim();
    const validation = validateProviderUrl(trimmedUrl, provider, providerLabel);
    if (!validation.valid) continue;
    await upsertProviderLink({
      releaseId,
      providerId: provider,
      url: trimmedUrl,
      sourceType: 'manual',
    });
  }
}

/* ------------------------------------------------------------------ */
/*  createRelease — manually add a release to the creator's discography */
/* ------------------------------------------------------------------ */

export async function createRelease(formData: {
  title: string;
  releaseType: 'single' | 'ep' | 'album' | 'compilation' | 'live';
  releaseDate?: string | null;
  artworkUrl?: string | null;
  providerUrls?: Record<string, string>;
}): Promise<{ success: boolean; message: string; releaseId?: string }> {
  noStore();

  const profile = await requireProfile();

  const title = formData.title.trim();
  if (!title) {
    return { success: false, message: 'Title is required.' };
  }

  const slug = slugify(title);
  if (!slug) {
    return {
      success: false,
      message: 'Could not generate a valid slug from the title.',
    };
  }

  const releaseDate = formData.releaseDate
    ? new Date(formData.releaseDate)
    : null;

  try {
    const [inserted] = await db
      .insert(discogReleases)
      .values({
        creatorProfileId: profile.id,
        title,
        slug,
        releaseType: formData.releaseType,
        releaseDate,
        artworkUrl: formData.artworkUrl ?? null,
        sourceType: 'manual',
        totalTracks: formData.releaseType === 'single' ? 1 : 0,
      })
      .returning({ id: discogReleases.id });

    const releaseId = inserted.id;

    // Upsert any provider URLs the user supplied
    if (formData.providerUrls) {
      await upsertReleaseProviderUrls(releaseId, formData.providerUrls);
    }

    revalidatePath(APP_ROUTES.RELEASES);
    revalidateTag(createSmartLinkContentTag(profile.id), 'max');

    return {
      success: true,
      message: `Release "${title}" created.`,
      releaseId,
    };
  } catch (error) {
    throwIfRedirect(error);

    // Handle duplicate slug
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: `A release with the slug "${slug}" already exists. Please choose a different title.`,
      };
    }

    void captureError('createRelease failed', error as Error, {
      action: 'createRelease',
      title,
    });
    return {
      success: false,
      message: 'Failed to create release. Please try again.',
    };
  }
}
