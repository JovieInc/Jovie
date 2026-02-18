'use server';

import { redirect } from 'next/navigation';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import {
  type ReleaseWithProviders,
  type TrackWithProviders,
} from '@/lib/discography/queries';
import type {
  ProviderKey,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { VIDEO_PROVIDER_KEYS } from '@/lib/discography/video-providers';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrFallback, toISOStringOrNull } from '@/lib/utils/date';
import { getDashboardData } from '../actions';

export function buildProviderLabels() {
  return Object.entries(PROVIDER_CONFIG).reduce(
    (acc, [key, value]) => {
      acc[key as ProviderKey] = value.label;
      return acc;
    },
    {} as Record<ProviderKey, string>
  );
}

export async function requireProfile(profileId?: string): Promise<{
  id: string;
  spotifyId: string | null;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
  }

  let profile = data.selectedProfile;

  // If a specific profile is requested, ensure the user owns it
  if (profileId) {
    profile = data.creatorProfiles.find(p => p.id === profileId) ?? null;
  }

  if (!profile) {
    throw new TypeError('Missing creator profile');
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
export function mapReleaseToViewModel(
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
    releaseDate: toISOStringOrNull(release.releaseDate) ?? undefined,
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
        const updatedAt = toISOStringOrFallback(match?.updatedAt);

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
    canvasStatus: getCanvasStatusFromMetadata(release.metadata),
    originalArtworkUrl: (release.metadata as Record<string, unknown> | null)
      ?.originalArtworkUrl as string | undefined,
    hasVideoLinks: release.providerLinks.some(link =>
      (VIDEO_PROVIDER_KEYS as string[]).includes(link.providerId)
    ),
  };
}

/**
 * Map track database data to view model
 */
export function mapTrackToViewModel(
  track: TrackWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  releaseSlug: string
): TrackViewModel {
  return {
    id: track.id,
    releaseId: track.releaseId,
    title: track.title,
    slug: track.slug,
    smartLinkPath: buildSmartLinkPath(profileHandle, track.slug),
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
        const updatedAt = toISOStringOrFallback(match?.updatedAt);

        return {
          key: providerKey,
          label,
          url,
          source,
          updatedAt,
          path: url
            ? buildSmartLinkPath(profileHandle, track.slug, providerKey)
            : '',
          isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
        };
      })
      .filter(provider => provider.url !== ''),
  };
}
