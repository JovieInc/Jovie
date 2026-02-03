'use server';

import { eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { validateProviderUrl } from '@/lib/discography/provider-domains';
import {
  getProviderLink,
  getReleaseById,
  getReleasesForProfile as getReleasesFromDb,
  getTracksForReleaseWithProviders,
  type ReleaseWithProviders,
  resetProviderLink as resetProviderLinkDb,
  type TrackWithProviders,
  upsertProviderLink,
} from '@/lib/discography/queries';
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
import { trackServerEvent } from '@/lib/server-analytics';
import { getDashboardData } from '../actions';

function buildProviderLabels() {
  return Object.entries(PROVIDER_CONFIG).reduce(
    (acc, [key, value]) => {
      acc[key as ProviderKey] = value.label;
      return acc;
    },
    {} as Record<ProviderKey, string>
  );
}

async function requireProfile(): Promise<{
  id: string;
  spotifyId: string | null;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    throw new TypeError('Missing creator profile');
  }

  return {
    id: data.selectedProfile.id,
    spotifyId: data.selectedProfile.spotifyId ?? null,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
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
  providerLabels: Record<ProviderKey, string>,
  profileId: string,
  profileHandle: string
): ReleaseViewModel {
  // Use the new short URL format: /{handle}/{slug}
  const slug = release.slug;

  return {
    profileId,
    id: release.id,
    title: release.title,
    releaseDate: release.releaseDate?.toISOString(),
    artworkUrl: release.artworkUrl ?? undefined,
    slug,
    smartLinkPath: buildSmartLinkPath(profileHandle, slug),
    spotifyPopularity: release.spotifyPopularity,
    providers: Object.entries(providerLabels)
      .map(([key, label]) => {
        const providerKey = key as ProviderKey;
        const match = release.providerLinks.find(
          link => link.providerId === providerKey
        );
        const url = match?.url ?? '';
        const source: 'manual' | 'ingested' =
          match?.sourceType === 'manual' ? 'manual' : 'ingested';
        const updatedAt =
          match?.updatedAt?.toISOString() ?? new Date().toISOString();

        return {
          key: providerKey,
          label,
          url,
          source,
          updatedAt,
          path: url ? buildSmartLinkPath(profileHandle, slug, providerKey) : '',
          isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
        };
      })
      .filter(provider => provider.url !== ''),
    // Extended fields
    releaseType: release.releaseType,
    upc: release.upc,
    label: release.label,
    totalTracks: release.totalTracks,
    totalDurationMs: release.trackSummary?.totalDurationMs ?? null,
    primaryIsrc: release.trackSummary?.primaryIsrc ?? null,
    genres: extractGenres(release.metadata),
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
 * Load release matrix with caching (30s TTL)
 * Cache is invalidated on mutations (save/reset provider links, Spotify sync)
 */
export async function loadReleaseMatrix(): Promise<ReleaseViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const profile = await requireProfile();

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
      throw new TypeError('Unauthorized');
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

    // Invalidate cache and revalidate path
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');
    revalidatePath('/app/dashboard/releases');

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
      throw new TypeError('Unauthorized');
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

    // Invalidate cache and revalidate path
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');
    revalidatePath('/app/dashboard/releases');

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
  revalidatePath('/app/dashboard/releases');

  if (result.success) {
    void trackServerEvent('releases_synced', {
      profileId: profile.id,
      imported: result.imported,
      source: 'spotify',
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

  revalidatePath('/app/dashboard/releases');

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
 * Map track database data to view model
 */
function mapTrackToViewModel(
  track: TrackWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  releaseSlug: string
): TrackViewModel {
  return {
    id: track.id,
    releaseId: track.releaseId,
    title: track.title,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    durationMs: track.durationMs,
    isrc: track.isrc,
    isExplicit: track.isExplicit,
    previewUrl: track.previewUrl,
    providers: Object.entries(providerLabels)
      .map(([key, label]) => {
        const providerKey = key as ProviderKey;
        const match = track.providerLinks.find(
          link => link.providerId === providerKey
        );
        const url = match?.url ?? '';
        const source: 'manual' | 'ingested' =
          match?.sourceType === 'manual' ? 'manual' : 'ingested';
        const updatedAt =
          match?.updatedAt?.toISOString() ?? new Date().toISOString();

        return {
          key: providerKey,
          label,
          url,
          source,
          updatedAt,
          path: url
            ? buildSmartLinkPath(profileHandle, releaseSlug, providerKey)
            : '',
          isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
        };
      })
      .filter(provider => provider.url !== ''),
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
