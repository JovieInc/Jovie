'use server';

import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
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
  };
}

/**
 * Map database release to view model
 */
function mapReleaseToViewModel(
  release: ReleaseWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileId: string
): ReleaseViewModel {
  // Build slug for smart link (profileId--releaseId format)
  const slug = `${release.slug}--${profileId}`;

  return {
    profileId,
    id: release.id,
    title: release.title,
    releaseDate: release.releaseDate?.toISOString(),
    artworkUrl: release.artworkUrl ?? undefined,
    slug,
    smartLinkPath: buildSmartLinkPath(slug),
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
        path: url ? buildSmartLinkPath(slug, providerKey) : '',
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
    mapReleaseToViewModel(release, providerLabels, profile.id)
  );
}

export async function saveProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
  url: string;
}): Promise<ReleaseViewModel> {
  noStore();
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
  return mapReleaseToViewModel(release, providerLabels, profile.id);
}

export async function resetProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
}): Promise<ReleaseViewModel> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();
  if (profile.id !== params.profileId) {
    throw new Error('Profile mismatch');
  }

  // Get the current provider link to check for ingested URL
  const existingLink = await getProviderLink(params.releaseId, params.provider);

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
  return mapReleaseToViewModel(release, providerLabels, profile.id);
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
}> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    return { connected: false, spotifyId: null };
  }

  try {
    const profile = await requireProfile();
    return {
      connected: !!profile.spotifyId,
      spotifyId: profile.spotifyId,
    };
  } catch {
    return { connected: false, spotifyId: null };
  }
}
