import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import {
  getReleaseById,
  getTracksForReleaseWithProviders,
  type TrackWithProviders,
} from '@/lib/discography/queries';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { toISOStringOrFallback } from '@/lib/utils/date';

function buildProviderLabels(): Record<ProviderKey, string> {
  return Object.entries(PROVIDER_CONFIG).reduce(
    (acc, [key, value]) => {
      acc[key as ProviderKey] = value.label;
      return acc;
    },
    {} as Record<ProviderKey, string>
  );
}

function mapTrackToViewModel(
  track: TrackWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string
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
    audioUrl: track.audioUrl,
    audioFormat: track.audioFormat,
    providers: Object.entries(providerLabels)
      .map(([key, label]) => {
        const providerKey = key as ProviderKey;
        const match = track.providerLinks.find(
          link => link.providerId === providerKey
        );
        const url = match?.url ?? '';
        const source: 'manual' | 'ingested' =
          match?.sourceType === 'manual' ? 'manual' : 'ingested';

        return {
          key: providerKey,
          label,
          url,
          source,
          updatedAt: toISOStringOrFallback(match?.updatedAt),
          path: url
            ? buildSmartLinkPath(profileHandle, track.slug, providerKey)
            : '',
          isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
        };
      })
      .filter(provider => provider.url !== ''),
  };
}

export async function loadReleaseTracksForProfile(params: {
  releaseId: string;
  profileId: string;
  profileHandle: string;
}): Promise<TrackViewModel[]> {
  const release = await getReleaseById(params.releaseId);

  if (release?.creatorProfileId !== params.profileId) {
    throw new TypeError('Release not found');
  }

  const providerLabels = buildProviderLabels();
  const { tracks } = await getTracksForReleaseWithProviders(params.releaseId);

  return tracks.map(track =>
    mapTrackToViewModel(track, providerLabels, params.profileHandle)
  );
}
