import { toISOStringOrFallback } from '@/lib/utils/date';
import {
  derivePreviewState,
  getProviderConfidence,
  summarizeProviderConfidence,
} from './audio-qa';
import type { ProviderKey, TrackViewModel } from './types';
import { buildTrackDeepLinkPath } from './utils';

export interface ProviderLinkInput {
  providerId: string;
  sourceType?: string | null;
  updatedAt?: Date | string | null;
  url: string | null;
  metadata?: Record<string, unknown> | null;
}

function mapProviderLinksToViewModel(
  providerLinks: ProviderLinkInput[],
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  releaseSlug: string,
  trackSlug: string
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
        confidence: getProviderConfidence(match),
        path: url
          ? buildTrackDeepLinkPath(
              profileHandle,
              releaseSlug,
              trackSlug,
              providerKey
            )
          : '',
        isPrimary: ['spotify', 'apple_music', 'youtube'].includes(providerKey),
      };
    })
    .filter(provider => provider.url !== '');
}

export function mapTrackToViewModel(params: {
  track: {
    id: string;
    releaseTrackId?: string;
    recordingId?: string;
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
    metadata?: Record<string, unknown> | null;
    providerLinks: ProviderLinkInput[];
  };
  providerLabels: Record<ProviderKey, string>;
  profileHandle: string;
  releaseSlug: string;
}): TrackViewModel {
  const { track, providerLabels, profileHandle, releaseSlug } = params;
  const previewState = derivePreviewState({
    audioUrl: track.audioUrl,
    previewUrl: track.previewUrl,
    metadata: track.metadata,
    providerLinks: track.providerLinks,
  });

  return {
    id: track.id,
    releaseTrackId: track.releaseTrackId,
    recordingId: track.recordingId,
    releaseId: track.releaseId,
    releaseSlug,
    title: track.title,
    slug: track.slug,
    smartLinkPath: buildTrackDeepLinkPath(
      profileHandle,
      releaseSlug,
      track.slug
    ),
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    durationMs: track.durationMs,
    isrc: track.isrc,
    isExplicit: track.isExplicit,
    previewUrl: track.previewUrl,
    audioUrl: track.audioUrl,
    audioFormat: track.audioFormat,
    previewSource: previewState.previewSource,
    previewVerification: previewState.previewVerification,
    providerConfidenceSummary: summarizeProviderConfidence(track.providerLinks),
    providers: mapProviderLinksToViewModel(
      track.providerLinks,
      providerLabels,
      profileHandle,
      releaseSlug,
      track.slug
    ),
  };
}
