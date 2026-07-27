import {
  AUDIO_FORMAT_IDS,
  type AudioFormatId,
  type AudioPlaybackAsset,
  type AudioPlaybackDerivative,
  getAudioFormatByMimeType,
  resolveAudioSource,
} from '@jovie/audio-contracts';

// Stryker disable next-line StringLiteral: module initializer mutations run
// before the active mutant test and are guarded by an exact-value test.
export const AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY = 'audioPlaybackDerivative';

function isAudioFormatId(value: unknown): value is AudioFormatId {
  return AUDIO_FORMAT_IDS.includes(value as AudioFormatId);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!URL.canParse(value)) return false;
  const parsed = new URL(value);
  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

function isBaseDerivative(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  generation: number;
  sourceFormatId: AudioFormatId;
} {
  return (
    Number.isInteger(value.generation) &&
    Number(value.generation) > 0 &&
    isAudioFormatId(value.sourceFormatId)
  );
}

export function parseAudioPlaybackDerivative(
  metadata: Record<string, unknown> | null | undefined
): AudioPlaybackDerivative | null {
  const value = metadata?.[AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY];
  if (!value || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (!isBaseDerivative(candidate)) return null;

  switch (candidate.status) {
    case 'pending':
      return typeof candidate.requestedAt === 'string'
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    case 'ready':
      return isHttpUrl(candidate.url) &&
        candidate.mimeType === 'audio/wav' &&
        typeof candidate.readyAt === 'string' &&
        Number.isInteger(candidate.outputBytes) &&
        Number(candidate.outputBytes) > 0
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    case 'failed':
      return [
        'invalid_source',
        'conversion_failed',
        'resource_limit',
        'storage_failed',
      ].includes(String(candidate.reason)) &&
        typeof candidate.failedAt === 'string'
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    case 'unavailable':
      return ['platform_unsupported', 'conversion_not_supported'].includes(
        String(candidate.reason)
      )
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    case 'retrying':
      return Number.isInteger(candidate.attempt) &&
        Number(candidate.attempt) > 0 &&
        Number.isInteger(candidate.maxAttempts) &&
        Number(candidate.maxAttempts) >= Number(candidate.attempt) &&
        typeof candidate.retryAt === 'string'
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    case 'superseded':
      return typeof candidate.supersededAt === 'string'
        ? (candidate as unknown as AudioPlaybackDerivative)
        : null;
    default:
      return null;
  }
}

export function nextAudioDerivativeGeneration(
  metadata: Record<string, unknown> | null | undefined
): number {
  return (parseAudioPlaybackDerivative(metadata)?.generation ?? 0) + 1;
}

export function withAudioPlaybackDerivative(
  metadata: Record<string, unknown> | null | undefined,
  derivative: AudioPlaybackDerivative
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY]: derivative,
  };
}

export function resolveRecordingPlayback(input: {
  readonly audioFormat: string | null;
  readonly audioUrl: string | null;
  readonly previewUrl?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}) {
  if (input.previewUrl && input.previewUrl !== input.audioUrl) {
    return {
      status: 'ready',
      source: 'derivative',
      url: input.previewUrl,
    } as const;
  }

  if (!input.audioUrl || !input.audioFormat) {
    return { status: 'unavailable', source: null, url: null } as const;
  }

  const format = getAudioFormatByMimeType(input.audioFormat);
  if (!format) {
    return { status: 'unavailable', source: null, url: null } as const;
  }

  const asset: AudioPlaybackAsset = {
    formatId: format.id,
    masterUrl: input.audioUrl,
    derivative: parseAudioPlaybackDerivative(input.metadata),
  };
  return resolveAudioSource(asset, 'web_chromium', 'nativePlayback');
}
