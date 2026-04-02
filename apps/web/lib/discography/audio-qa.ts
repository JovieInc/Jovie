import { PRIMARY_PROVIDER_KEYS } from '@/lib/discography/config';
import type {
  PreviewCounts,
  PreviewSource,
  PreviewVerification,
  ProviderConfidence,
  ProviderConfidenceSummary,
  ProviderKey,
} from '@/lib/discography/types';

interface ProviderLinkInput {
  readonly providerId: string;
  readonly url: string | null;
  readonly sourceType?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

interface TrackAudioQaInput {
  readonly audioUrl: string | null;
  readonly previewUrl: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly providerLinks: ProviderLinkInput[];
}

interface PreviewResolutionMetadata {
  readonly status?: PreviewVerification;
  readonly source?: PreviewSource;
}

function parsePreviewResolution(
  metadata: Record<string, unknown> | null | undefined
): PreviewResolutionMetadata | null {
  if (!metadata) return null;
  const raw = metadata.previewResolution;
  if (!raw || typeof raw !== 'object') return null;
  const previewResolution = raw as {
    status?: unknown;
    source?: unknown;
  };

  const status =
    typeof previewResolution.status === 'string' &&
    ['verified', 'fallback', 'unknown', 'missing'].includes(
      previewResolution.status
    )
      ? (previewResolution.status as PreviewVerification)
      : undefined;
  const source =
    typeof previewResolution.source === 'string' &&
    ['audio_url', 'spotify', 'apple_music', 'deezer', 'musicfetch'].includes(
      previewResolution.source
    )
      ? (previewResolution.source as PreviewSource)
      : null;

  if (!status && source == null) return null;

  return {
    status,
    source,
  };
}

export function getProviderConfidence(
  link: ProviderLinkInput | null | undefined
): ProviderConfidence {
  if (!link?.url) return 'unknown';

  const discoveredFrom = link.metadata?.discoveredFrom;
  if (discoveredFrom === 'search_fallback') {
    return 'search_fallback';
  }

  if (link.sourceType === 'manual' || discoveredFrom === 'manual_override') {
    return 'manual_override';
  }

  return 'canonical';
}

export function derivePreviewState(input: TrackAudioQaInput): {
  previewSource: PreviewSource;
  previewVerification: PreviewVerification;
} {
  if (input.audioUrl) {
    return {
      previewSource: 'audio_url',
      previewVerification: 'verified',
    };
  }

  const previewResolution = parsePreviewResolution(input.metadata);

  if (input.previewUrl) {
    return {
      previewSource: previewResolution?.source ?? null,
      previewVerification:
        previewResolution?.status === 'fallback' ? 'fallback' : 'verified',
    };
  }

  if (previewResolution?.status === 'unknown') {
    return {
      previewSource: null,
      previewVerification: 'unknown',
    };
  }

  if (previewResolution?.status === 'missing') {
    return {
      previewSource: null,
      previewVerification: 'missing',
    };
  }

  return {
    previewSource: null,
    previewVerification: 'missing',
  };
}

export function summarizeProviderConfidence(
  providerLinks: ProviderLinkInput[]
): ProviderConfidenceSummary {
  let canonical = 0;
  let searchFallback = 0;
  const resolvedPrimaryProviders = new Set<ProviderKey>();

  for (const providerKey of PRIMARY_PROVIDER_KEYS) {
    const link = providerLinks.find(item => item.providerId === providerKey);
    const confidence = getProviderConfidence(link);

    if (confidence === 'unknown') {
      continue;
    }

    resolvedPrimaryProviders.add(providerKey);

    if (confidence === 'search_fallback') {
      searchFallback++;
      continue;
    }

    canonical++;
  }

  const unresolvedProviders = PRIMARY_PROVIDER_KEYS.filter(
    providerKey => !resolvedPrimaryProviders.has(providerKey)
  );

  return {
    canonical,
    searchFallback,
    unknown: unresolvedProviders.length,
    unresolvedProviders,
  };
}

export function summarizePreviewCounts(
  tracks: Array<{ previewVerification?: PreviewVerification }>
): PreviewCounts {
  return tracks.reduce<PreviewCounts>(
    (counts, track) => {
      const verification = track.previewVerification ?? 'missing';
      counts[verification]++;
      return counts;
    },
    {
      verified: 0,
      fallback: 0,
      unknown: 0,
      missing: 0,
    }
  );
}

export function summarizeReleaseProviderCounts(
  tracks: Array<{ providerConfidenceSummary?: ProviderConfidenceSummary }>
): ProviderConfidenceSummary {
  return tracks.reduce<ProviderConfidenceSummary>(
    (counts, track) => {
      const summary = track.providerConfidenceSummary;
      counts.canonical += summary?.canonical ?? 0;
      counts.searchFallback += summary?.searchFallback ?? 0;
      counts.unknown += summary?.unknown ?? 0;
      return counts;
    },
    {
      canonical: 0,
      searchFallback: 0,
      unknown: 0,
    }
  );
}
