'use server';

import { eq } from 'drizzle-orm';
import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import {
  getProviderLink,
  getReleaseById,
  getReleasesForProfile as getReleasesFromDb,
  type ReleaseWithProviders,
  resetProviderLink as resetProviderLinkDb,
  upsertProviderLink,
} from '@/lib/discography/queries';
import {
  type SpotifyImportResult,
  syncReleasesFromSpotify,
} from '@/lib/discography/spotify-import';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
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
    throw new Error('Missing creator profile');
  }

  return {
    id: data.selectedProfile.id,
    spotifyId: data.selectedProfile.spotifyId ?? null,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
  };
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
    providers: Object.entries(providerLabels).map(([key, label]) => {
      const providerKey = key as ProviderKey;
      const match = release.providerLinks.find(
        link => link.providerId === providerKey
      );
      const url = match?.url ?? '';
      const source = match?.sourceType === 'manual' ? 'manual' : 'ingested';
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
    }),
  };
}

export async function loadReleaseMatrix(): Promise<ReleaseViewModel[]> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const profile = await requireProfile();
  const providerLabels = buildProviderLabels();
  const releases = await getReleasesFromDb(profile.id);

  return releases.map(release =>
    mapReleaseToViewModel(release, providerLabels, profile.id, profile.handle)
  );
}

/**
 * Known provider domains for validation
 */
const PROVIDER_DOMAINS: Partial<Record<ProviderKey, string[]>> = {
  spotify: ['open.spotify.com', 'spotify.com', 'spotify.link'],
  apple_music: [
    'music.apple.com',
    'itunes.apple.com',
    'geo.music.apple.com',
    'apple.co',
  ],
  youtube: [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'music.youtube.com',
  ],
  soundcloud: ['soundcloud.com', 'on.soundcloud.com', 'm.soundcloud.com'],
  deezer: ['deezer.com', 'www.deezer.com', 'deezer.page.link'],
  tidal: ['tidal.com', 'listen.tidal.com'],
  amazon_music: ['music.amazon.com', 'amazon.com'],
  bandcamp: ['bandcamp.com'],
};

/**
 * Validate URL format and optionally check provider domain
 */
function validateUrl(
  url: string,
  provider?: ProviderKey
): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http:// or https://' };
    }

    // Check provider domain if specified
    if (provider && PROVIDER_DOMAINS[provider]) {
      const domains = PROVIDER_DOMAINS[provider]!;
      const hostname = parsed.hostname.toLowerCase();

      const isValidDomain = domains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isValidDomain) {
        const expectedDomains = domains.join(', ');
        return {
          valid: false,
          error: `URL must be from ${PROVIDER_CONFIG[provider].label} (${expectedDomains})`,
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
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
      throw new Error('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new Error('Profile mismatch');
    }

    const trimmedUrl = params.url.trim();
    if (!trimmedUrl) {
      throw new Error('URL is required');
    }

    // Validate URL format and provider domain
    const validation = validateUrl(trimmedUrl, params.provider);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new Error('Invalid provider');
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
      throw new Error('Release not found');
    }

    const providerLabels = buildProviderLabels();
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
      throw new Error('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new Error('Profile mismatch');
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new Error('Invalid provider');
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
      throw new Error('Release not found');
    }

    const providerLabels = buildProviderLabels();
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
    throw new Error('Unauthorized');
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
