import { toISOStringOrFallback } from '@/lib/utils/date';
import type { ProviderKey, TrackViewModel } from './types';
import { buildSmartLinkPath } from './utils';

export interface ProviderLinkInput {
  providerId: string;
  sourceType?: string | null;
  updatedAt?: Date | string | null;
  url: string | null;
}

function mapProviderLinksToViewModel(
  providerLinks: ProviderLinkInput[],
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  slug: string
): TrackViewModel['providers'] {
  return Object.entries(providerLabels)
    .map(([key, label]) => {
      const providerKey = key as ProviderKey;
      const match = providerLinks.find(link => link.providerId === providerKey);
      const url = match?.url ?? '';

      const source: 'manual' | 'ingested' =
        match?.sourceType === 'manual' ? 'manual' : 'ingested';

      return {
        key: providerKey,
        label,
        url,
        source,
        updatedAt: toISOStringOrFallback(match?.updatedAt),
        path: url ? buildSmartLinkPath(profileHandle, slug, providerKey) : '',
        isPrimary: ['spotify', 'apple_music', 'youtube'].includes(providerKey),
      };
    })
    .filter(provider => provider.url !== '');
}

export function mapTrackToViewModel(params: {
  track: {
    id: string;
    releaseId: string;
    title: string;
    slug: string;
    trackNumber: number;
    discNumber: number;
    durationMs: number | null;
    isrc: string | null;
    isExplicit: boolean;
    previewUrl: string | null;
    audioUrl: string | null;
    audioFormat: string | null;
    providerLinks: ProviderLinkInput[];
  };
  providerLabels: Record<ProviderKey, string>;
  profileHandle: string;
}): TrackViewModel {
  const { track, providerLabels, profileHandle } = params;

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
    providers: mapProviderLinksToViewModel(
      track.providerLinks,
      providerLabels,
      profileHandle,
      track.slug
    ),
  };
}
