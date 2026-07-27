import { type AnalysisConfidence, analysisConfidence } from './units';

export const AUDIO_ANALYSIS_CAPABILITIES = [
  'tempo',
  'beat_grid',
  'musical_key',
] as const;

export type AudioAnalysisCapability =
  (typeof AUDIO_ANALYSIS_CAPABILITIES)[number];

export const AUDIO_ANALYSIS_EXECUTION_TARGET = 'offline_worker' as const;

export const AUDIO_ANALYSIS_PROVIDER_IDS = ['openkeyscan', 'essentia'] as const;

export type AudioAnalysisProviderId =
  (typeof AUDIO_ANALYSIS_PROVIDER_IDS)[number];

export const AUDIO_ANALYSIS_PROVIDER_ADOPTION_STATUSES = [
  'benchmark_candidate',
  'license_review_required',
  'approved',
] as const;

export type AudioAnalysisProviderAdoptionStatus =
  (typeof AUDIO_ANALYSIS_PROVIDER_ADOPTION_STATUSES)[number];

export const AUDIO_ANALYSIS_PROVIDER_ADAPTERS = [
  'ndjson_subprocess',
  'native_worker',
] as const;

export type AudioAnalysisProviderAdapter =
  (typeof AUDIO_ANALYSIS_PROVIDER_ADAPTERS)[number];

export const AUDIO_ANALYSIS_PROVIDER_LICENSES = [
  'mit',
  'agpl_or_commercial',
] as const;

export type AudioAnalysisProviderLicense =
  (typeof AUDIO_ANALYSIS_PROVIDER_LICENSES)[number];

export interface AudioAnalysisProviderDefinition {
  readonly id: AudioAnalysisProviderId;
  readonly label: string;
  readonly capabilities: readonly AudioAnalysisCapability[];
  readonly adoptionStatus: AudioAnalysisProviderAdoptionStatus;
  readonly adapter: AudioAnalysisProviderAdapter;
  readonly license: AudioAnalysisProviderLicense;
  readonly executionTarget: typeof AUDIO_ANALYSIS_EXECUTION_TARGET;
}

/**
 * Canonical analyzer candidates.
 *
 * Registry presence means Jovie can identify and evaluate a provider. It does
 * not mean the provider may run in production. Only an explicit `approved`
 * adoption status makes a provider production-selectable.
 */
export const AUDIO_ANALYSIS_PROVIDER_REGISTRY = [
  {
    id: 'openkeyscan',
    label: 'OpenKeyScan',
    capabilities: ['musical_key'],
    adoptionStatus: 'benchmark_candidate',
    adapter: 'ndjson_subprocess',
    license: 'mit',
    executionTarget: AUDIO_ANALYSIS_EXECUTION_TARGET,
  },
  {
    id: 'essentia',
    label: 'Essentia',
    capabilities: ['tempo', 'beat_grid', 'musical_key'],
    adoptionStatus: 'license_review_required',
    adapter: 'native_worker',
    license: 'agpl_or_commercial',
    executionTarget: AUDIO_ANALYSIS_EXECUTION_TARGET,
  },
] as const satisfies readonly AudioAnalysisProviderDefinition[];

export function getAudioAnalysisProvider(
  providerId: string
): AudioAnalysisProviderDefinition | null {
  const normalized = providerId.trim().toLowerCase();
  return (
    AUDIO_ANALYSIS_PROVIDER_REGISTRY.find(
      provider => provider.id === normalized
    ) ?? null
  );
}

export function getAudioAnalysisProviderCandidates(
  capability: AudioAnalysisCapability
): readonly AudioAnalysisProviderDefinition[] {
  if (
    !(AUDIO_ANALYSIS_CAPABILITIES as readonly string[]).includes(capability)
  ) {
    throw new RangeError('analysis capability is not canonical');
  }

  return AUDIO_ANALYSIS_PROVIDER_REGISTRY.filter(provider =>
    (provider.capabilities as readonly AudioAnalysisCapability[]).includes(
      capability
    )
  );
}

export function getApprovedAudioAnalysisProvider(
  capability: AudioAnalysisCapability
): AudioAnalysisProviderDefinition | null {
  return findApprovedAudioAnalysisProvider(
    AUDIO_ANALYSIS_PROVIDER_REGISTRY,
    capability
  );
}

export function findApprovedAudioAnalysisProvider(
  providers: readonly AudioAnalysisProviderDefinition[],
  capability: AudioAnalysisCapability
): AudioAnalysisProviderDefinition | null {
  if (
    !(AUDIO_ANALYSIS_CAPABILITIES as readonly string[]).includes(capability)
  ) {
    throw new RangeError('analysis capability is not canonical');
  }

  return (
    providers.find(
      provider =>
        provider.adoptionStatus === 'approved' &&
        (provider.capabilities as readonly AudioAnalysisCapability[]).includes(
          capability
        )
    ) ?? null
  );
}

export const AUDIO_ANALYSIS_JOB_STATUSES = [
  'queued',
  'processing',
  'succeeded',
  'partial',
  'failed',
  'cancelled',
] as const;

export type AudioAnalysisJobStatus =
  (typeof AUDIO_ANALYSIS_JOB_STATUSES)[number];

export const AUDIO_ANALYSIS_OUTCOME_STATUSES = [
  'unknown',
  'partial',
  'complete',
  'failed',
] as const;

export type AudioAnalysisOutcomeStatus =
  (typeof AUDIO_ANALYSIS_OUTCOME_STATUSES)[number];

export const AUDIO_ANALYSIS_FAILURE_CODES = [
  'unsupported_format',
  'decode_failed',
  'analysis_timeout',
  'analyzer_failed',
] as const;

export type AudioAnalysisFailureCode =
  (typeof AUDIO_ANALYSIS_FAILURE_CODES)[number];

export const AUDIO_ANALYSIS_MAX_TIMEOUT_MS = 1_800_000;
export const AUDIO_ANALYSIS_MAX_MEMORY_MB = 4_096;
export const AUDIO_ANALYSIS_MAX_ATTEMPTS = 3;

export interface AudioAnalysisJobRequest {
  readonly assetId: string;
  readonly inputContentHash: Sha256ContentHash;
  readonly capabilities: readonly AudioAnalysisCapability[];
  readonly executionTarget: typeof AUDIO_ANALYSIS_EXECUTION_TARGET;
  readonly timeoutMs: number;
  readonly maxMemoryMb: number;
  readonly maxAttempts: number;
}

export interface AudioAnalysisJobRequestInput {
  readonly assetId: string;
  readonly inputContentHash: string;
  readonly capabilities: readonly AudioAnalysisCapability[];
  readonly timeoutMs: number;
  readonly maxMemoryMb: number;
  readonly maxAttempts: number;
}

export const MUSICAL_KEY_TONICS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type MusicalKeyTonic = (typeof MUSICAL_KEY_TONICS)[number];

export const MUSICAL_KEY_MODES = ['major', 'minor'] as const;
export type MusicalKeyMode = (typeof MUSICAL_KEY_MODES)[number];

const CAMELOT_MAJOR = {
  C: '8B',
  'C#': '3B',
  D: '10B',
  'D#': '5B',
  E: '12B',
  F: '7B',
  'F#': '2B',
  G: '9B',
  'G#': '4B',
  A: '11B',
  'A#': '6B',
  B: '1B',
} as const satisfies Readonly<Record<MusicalKeyTonic, string>>;

const CAMELOT_MINOR = {
  C: '5A',
  'C#': '12A',
  D: '7A',
  'D#': '2A',
  E: '9A',
  F: '4A',
  'F#': '11A',
  G: '6A',
  'G#': '1A',
  A: '8A',
  'A#': '3A',
  B: '10A',
} as const satisfies Readonly<Record<MusicalKeyTonic, string>>;

function camelotToOpenKey(camelot: string): string {
  const number = Number.parseInt(camelot, 10);
  const openKeyNumber = ((number + 4) % 12) + 1;
  return `${openKeyNumber}${camelot.endsWith('A') ? 'm' : 'd'}`;
}

export interface CanonicalMusicalKey {
  readonly tonic: MusicalKeyTonic;
  readonly mode: MusicalKeyMode;
  readonly traditional: string;
  readonly camelot: string;
  readonly openKey: string;
}

export function createCanonicalMusicalKey(
  tonic: MusicalKeyTonic,
  mode: MusicalKeyMode
): CanonicalMusicalKey {
  if (!(MUSICAL_KEY_TONICS as readonly string[]).includes(tonic)) {
    throw new RangeError('musical key tonic is not canonical');
  }
  if (!(MUSICAL_KEY_MODES as readonly string[]).includes(mode)) {
    throw new RangeError('musical key mode is not canonical');
  }

  const camelot =
    mode === 'major' ? CAMELOT_MAJOR[tonic] : CAMELOT_MINOR[tonic];
  return {
    tonic,
    mode,
    traditional: `${tonic} ${mode}`,
    camelot,
    openKey: camelotToOpenKey(camelot),
  };
}

declare const audioAnalysisBrand: unique symbol;

export type Sha256ContentHash = string & {
  readonly [audioAnalysisBrand]: 'sha256-content-hash';
};
export type IsoTimestamp = string & {
  readonly [audioAnalysisBrand]: 'iso-timestamp';
};

export function sha256ContentHash(value: string): Sha256ContentHash {
  const normalized = value.trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError('content hash must be a sha256-prefixed hex digest');
  }
  return normalized as Sha256ContentHash;
}

export function isoTimestamp(value: string): IsoTimestamp {
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new TypeError('analysis timestamp must be canonical ISO-8601 UTC');
  }
  return value as IsoTimestamp;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} must not be empty`);
  }
  return normalized;
}

export interface AudioAnalysisProvenance {
  readonly analyzerId: AudioAnalysisProviderId;
  readonly analyzerVersion: string;
  readonly modelId: string | null;
  readonly confidence: AnalysisConfidence;
  readonly analyzedAt: IsoTimestamp;
  readonly inputContentHash: Sha256ContentHash;
}

export interface AudioAnalysisProvenanceInput {
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly modelId?: string | null;
  readonly confidence: number;
  readonly analyzedAt: string;
  readonly inputContentHash: string;
}

export function createAudioAnalysisProvenance(
  input: AudioAnalysisProvenanceInput
): AudioAnalysisProvenance {
  const provider = getAudioAnalysisProvider(input.analyzerId);
  if (!provider) {
    throw new TypeError('analyzer id is not canonical');
  }

  return {
    analyzerId: provider.id,
    analyzerVersion: requireNonEmpty(input.analyzerVersion, 'analyzer version'),
    modelId:
      input.modelId == null ? null : requireNonEmpty(input.modelId, 'model id'),
    confidence: analysisConfidence(input.confidence),
    analyzedAt: isoTimestamp(input.analyzedAt),
    inputContentHash: sha256ContentHash(input.inputContentHash),
  };
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
  return value;
}

function requireBoundedPositiveInteger(
  value: number,
  maximum: number,
  field: string
): number {
  const integer = requirePositiveInteger(value, field);
  if (integer > maximum) {
    throw new RangeError(`${field} must not exceed ${maximum}`);
  }
  return integer;
}

export function createAudioAnalysisJobRequest(
  input: AudioAnalysisJobRequestInput
): AudioAnalysisJobRequest {
  if (input.capabilities.length === 0) {
    throw new RangeError('analysis capabilities must not be empty');
  }
  if (new Set(input.capabilities).size !== input.capabilities.length) {
    throw new RangeError('analysis capabilities must be unique');
  }
  if (
    input.capabilities.some(
      capability =>
        !(AUDIO_ANALYSIS_CAPABILITIES as readonly string[]).includes(capability)
    )
  ) {
    throw new RangeError('analysis capability is not canonical');
  }

  return {
    assetId: requireNonEmpty(input.assetId, 'audio asset id'),
    inputContentHash: sha256ContentHash(input.inputContentHash),
    capabilities: [...input.capabilities],
    executionTarget: AUDIO_ANALYSIS_EXECUTION_TARGET,
    timeoutMs: requireBoundedPositiveInteger(
      input.timeoutMs,
      AUDIO_ANALYSIS_MAX_TIMEOUT_MS,
      'analysis timeout'
    ),
    maxMemoryMb: requireBoundedPositiveInteger(
      input.maxMemoryMb,
      AUDIO_ANALYSIS_MAX_MEMORY_MB,
      'analysis memory'
    ),
    maxAttempts: requireBoundedPositiveInteger(
      input.maxAttempts,
      AUDIO_ANALYSIS_MAX_ATTEMPTS,
      'analysis max attempts'
    ),
  };
}
