import {
  derivePreviewState,
  getProviderConfidence,
  summarizeProviderConfidence,
} from '@/lib/discography/audio-qa';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import {
  getReleaseById,
  getReleaseTracksForReleaseWithProviders,
  getTracksForReleaseWithProviders,
  type ReleaseTrackWithProviders,
  type TrackWithProviders,
} from '@/lib/discography/queries';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
import { buildTrackDeepLinkPath } from '@/lib/discography/utils';
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

function mapProviders(
  providerLinks: Array<{
    providerId: string;
    sourceType?: string | null;
    updatedAt?: Date | string | null;
    url: string | null;
    metadata?: Record<string, unknown> | null;
  }>,
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
        isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
      };
    })
    .filter(provider => provider.url !== '');
}

function mapLegacyTrackToViewModel(
  track: TrackWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  releaseSlug: string
): TrackViewModel {
  const previewState = derivePreviewState({
    audioUrl: track.audioUrl,
    previewUrl: track.previewUrl,
    metadata: track.metadata,
    providerLinks: track.providerLinks,
  });

  return {
    id: track.id,
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
    lyrics: track.lyrics,
    previewSource: previewState.previewSource,
    previewVerification: previewState.previewVerification,
    providerConfidenceSummary: summarizeProviderConfidence(track.providerLinks),
    providers: mapProviders(
      track.providerLinks,
      providerLabels,
      profileHandle,
      releaseSlug,
      track.slug
    ),
  };
}

function mapReleaseTrackToViewModel(
  track: ReleaseTrackWithProviders,
  providerLabels: Record<ProviderKey, string>,
  profileHandle: string,
  releaseSlug: string
): TrackViewModel {
  const previewState = derivePreviewState({
    audioUrl: track.audioUrl,
    previewUrl: track.previewUrl,
    metadata: track.metadata,
    providerLinks: track.providerLinks,
  });

  return {
    id: track.recordingId,
    releaseTrackId: track.id,
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
    lyrics: track.lyrics,
    previewSource: previewState.previewSource,
    previewVerification: previewState.previewVerification,
    providerConfidenceSummary: summarizeProviderConfidence(track.providerLinks),
    providers: mapProviders(
      track.providerLinks,
      providerLabels,
      profileHandle,
      releaseSlug,
      track.slug
    ),
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
  const releaseSlug = release.slug;

  // Try new model first, fall back to legacy
  const newResult = await getReleaseTracksForReleaseWithProviders(
    params.releaseId
  );

  if (newResult.total > 0) {
    return newResult.tracks.map(track =>
      mapReleaseTrackToViewModel(
        track,
        providerLabels,
        params.profileHandle,
        releaseSlug
      )
    );
  }

  // Fallback to legacy discog_tracks
  const { tracks } = await getTracksForReleaseWithProviders(params.releaseId);

  return tracks.map(track =>
    mapLegacyTrackToViewModel(
      track,
      providerLabels,
      params.profileHandle,
      releaseSlug
    )
  );
}
