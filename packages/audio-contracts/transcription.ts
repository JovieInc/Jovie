export const AUDIO_TRANSCRIPTION_STATUSES = [
  'idle',
  'requesting-permission',
  'listening',
  'partial',
  'processing',
  'completed',
  'empty',
  'cancelled',
  'failed',
  'unsupported',
] as const;

export type AudioTranscriptionStatus =
  (typeof AUDIO_TRANSCRIPTION_STATUSES)[number];

export const AUDIO_TRANSCRIPTION_EVENTS = [
  'permission-requested',
  'capture-started',
  'partial-result',
  'capture-stopped',
  'final-result',
  'empty-result',
  'cancel',
  'fail',
  'unsupported',
  'reset',
] as const;

export type AudioTranscriptionEvent =
  (typeof AUDIO_TRANSCRIPTION_EVENTS)[number];

export const AUDIO_TRANSCRIPTION_SOURCES = [
  'provided',
  'captions',
  'speech-recognition',
  'none',
] as const;

export type AudioTranscriptionSource =
  (typeof AUDIO_TRANSCRIPTION_SOURCES)[number];

export const AUDIO_TRANSCRIPTION_EXECUTIONS = [
  'provided',
  'on-device',
  'network',
  'provider-managed',
  'unavailable',
] as const;

export type AudioTranscriptionExecution =
  (typeof AUDIO_TRANSCRIPTION_EXECUTIONS)[number];

export const AUDIO_TRANSCRIPTION_ERROR_CODES = [
  'permission-denied',
  'service-not-allowed',
  'audio-capture',
  'no-speech',
  'network',
  'aborted',
  'unavailable',
  'empty-transcript',
  'unknown',
] as const;

export type AudioTranscriptionErrorCode =
  (typeof AUDIO_TRANSCRIPTION_ERROR_CODES)[number];

export const AUDIO_TRANSCRIPTION_PROVIDER_IDS = [
  'user',
  'youtube-captions',
  'web-speech',
  'apple-speech',
  'server-asr',
  'none',
] as const;

export type AudioTranscriptionProviderId =
  (typeof AUDIO_TRANSCRIPTION_PROVIDER_IDS)[number];

export interface AudioTranscriptionProviderDefinition {
  readonly id: AudioTranscriptionProviderId;
  readonly label: string;
  readonly source: AudioTranscriptionSource;
  readonly executions: readonly AudioTranscriptionExecution[];
  readonly supportsInterimResults: boolean;
  readonly supportsTimedSegments: boolean;
}

export const AUDIO_TRANSCRIPTION_PROVIDER_REGISTRY = {
  user: {
    id: 'user',
    label: 'User provided',
    source: 'provided',
    executions: ['provided'],
    supportsInterimResults: false,
    supportsTimedSegments: true,
  },
  'youtube-captions': {
    id: 'youtube-captions',
    label: 'YouTube captions',
    source: 'captions',
    executions: ['network'],
    supportsInterimResults: false,
    supportsTimedSegments: true,
  },
  'web-speech': {
    id: 'web-speech',
    label: 'Browser speech recognition',
    source: 'speech-recognition',
    executions: ['provider-managed'],
    supportsInterimResults: true,
    supportsTimedSegments: false,
  },
  'apple-speech': {
    id: 'apple-speech',
    label: 'Apple Speech',
    source: 'speech-recognition',
    executions: ['on-device', 'network'],
    supportsInterimResults: true,
    supportsTimedSegments: false,
  },
  'server-asr': {
    id: 'server-asr',
    label: 'Server speech recognition',
    source: 'speech-recognition',
    executions: ['network'],
    supportsInterimResults: false,
    supportsTimedSegments: true,
  },
  none: {
    id: 'none',
    label: 'Unavailable',
    source: 'none',
    executions: ['unavailable'],
    supportsInterimResults: false,
    supportsTimedSegments: false,
  },
} as const satisfies Readonly<
  Record<AudioTranscriptionProviderId, AudioTranscriptionProviderDefinition>
>;

export interface AudioTranscriptionProvenance {
  readonly source: AudioTranscriptionSource;
  readonly provider: AudioTranscriptionProviderId;
  readonly execution: AudioTranscriptionExecution;
  readonly locale?: string;
  readonly modelId?: string;
}

export interface AudioTranscriptionSegment {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly text: string;
  readonly confidence?: number;
  readonly isFinal?: boolean;
}

export interface AudioTranscriptionResult {
  readonly status: 'completed';
  readonly text: string;
  readonly segments: readonly AudioTranscriptionSegment[];
  readonly provenance: AudioTranscriptionProvenance;
  readonly latencyMilliseconds: number;
}

export function getNextAudioTranscriptionStatus(
  current: AudioTranscriptionStatus,
  event: AudioTranscriptionEvent
): AudioTranscriptionStatus {
  if (event === 'reset') return 'idle';

  switch (event) {
    case 'permission-requested':
      return current === 'idle' ? 'requesting-permission' : current;
    case 'capture-started':
      return current === 'idle' || current === 'requesting-permission'
        ? 'listening'
        : current;
    case 'partial-result':
      return current === 'listening' ? 'partial' : current;
    case 'capture-stopped':
      return current === 'listening' || current === 'partial'
        ? 'processing'
        : current;
    case 'final-result':
      return current === 'listening' ||
        current === 'partial' ||
        current === 'processing'
        ? 'completed'
        : current;
    case 'empty-result':
      return current === 'listening' ||
        current === 'partial' ||
        current === 'processing'
        ? 'empty'
        : current;
    case 'cancel':
      return current === 'requesting-permission' ||
        current === 'listening' ||
        current === 'partial' ||
        current === 'processing'
        ? 'cancelled'
        : current;
    case 'fail':
      return current === 'requesting-permission' ||
        current === 'listening' ||
        current === 'partial' ||
        current === 'processing'
        ? 'failed'
        : current;
    case 'unsupported':
      return current === 'idle' || current === 'requesting-permission'
        ? 'unsupported'
        : current;
    default:
      return current;
  }
}

function normalizeOptionalIdentifier(
  value: string | null | undefined,
  label: string
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

export function createAudioTranscriptionProvenance(input: {
  readonly provider: AudioTranscriptionProviderId;
  readonly execution: AudioTranscriptionExecution;
  readonly locale?: string | null;
  readonly modelId?: string | null;
}): AudioTranscriptionProvenance {
  const provider = AUDIO_TRANSCRIPTION_PROVIDER_REGISTRY[input.provider];
  if (!(provider.executions as readonly string[]).includes(input.execution)) {
    throw new TypeError(
      `Execution ${input.execution} is invalid for transcription provider ${input.provider}`
    );
  }

  return {
    source: provider.source,
    provider: provider.id,
    execution: input.execution,
    locale: normalizeOptionalIdentifier(input.locale, 'locale'),
    modelId: normalizeOptionalIdentifier(input.modelId, 'modelId'),
  };
}

export function createAudioTranscriptionSegment(input: {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly text: string;
  readonly confidence?: number;
  readonly isFinal?: boolean;
}): AudioTranscriptionSegment {
  if (!Number.isFinite(input.startSeconds) || input.startSeconds < 0) {
    throw new RangeError('startSeconds must be finite and non-negative');
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) {
    throw new RangeError('durationSeconds must be finite and non-negative');
  }
  const text = input.text.trim();
  if (!text)
    throw new TypeError('transcription segment text must not be empty');
  if (
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1)
  ) {
    throw new RangeError('confidence must be between 0 and 1');
  }

  return {
    startSeconds: input.startSeconds,
    durationSeconds: input.durationSeconds,
    text,
    confidence: input.confidence,
    isFinal: input.isFinal,
  };
}
