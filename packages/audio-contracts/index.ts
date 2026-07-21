export const AUDIO_FORMAT_IDS = [
  'mp3',
  'wav',
  'flac',
  'aiff',
  'aac',
  'm4a',
] as const;

export type AudioFormatId = (typeof AUDIO_FORMAT_IDS)[number];
export type AudioUploadSurface = 'library' | 'chat' | 'promo_download';
export type AudioPlatform = 'web' | 'desktop' | 'ios';

export interface AudioFormatDefinition {
  readonly id: AudioFormatId;
  readonly label: string;
  readonly canonicalMimeType: string;
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];
  readonly container: string;
  readonly expectedCodecs: readonly string[];
  readonly uploadSurfaces: readonly AudioUploadSurface[];
  readonly platforms: Readonly<Record<AudioPlatform, boolean>>;
}

const ALL_UPLOAD_SURFACES = [
  'library',
  'chat',
  'promo_download',
] as const satisfies readonly AudioUploadSurface[];

const CURRENT_PLATFORMS = {
  web: true,
  desktop: true,
  ios: false,
} as const satisfies Readonly<Record<AudioPlatform, boolean>>;

/**
 * Canonical contract for formats Jovie currently accepts.
 *
 * A format belongs here only when every declared upload surface accepts it.
 * Decode/playback/analysis support is a separate capability contract and must
 * not be inferred from a filename or MIME declaration.
 */
export const AUDIO_FORMAT_REGISTRY = [
  {
    id: 'mp3',
    label: 'MP3',
    canonicalMimeType: 'audio/mpeg',
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
    extensions: ['mp3'],
    container: 'mpeg-audio',
    expectedCodecs: ['mp3'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
  {
    id: 'wav',
    label: 'WAV',
    canonicalMimeType: 'audio/wav',
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
    extensions: ['wav'],
    container: 'wave',
    expectedCodecs: ['pcm', 'ieee-float'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
  {
    id: 'flac',
    label: 'FLAC',
    canonicalMimeType: 'audio/flac',
    mimeTypes: ['audio/flac', 'audio/x-flac'],
    extensions: ['flac'],
    container: 'flac',
    expectedCodecs: ['flac'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
  {
    id: 'aiff',
    label: 'AIFF',
    canonicalMimeType: 'audio/aiff',
    mimeTypes: ['audio/aiff', 'audio/x-aiff'],
    extensions: ['aif', 'aiff'],
    container: 'aiff',
    expectedCodecs: ['pcm'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
  {
    id: 'aac',
    label: 'AAC',
    canonicalMimeType: 'audio/aac',
    mimeTypes: ['audio/aac'],
    extensions: ['aac'],
    container: 'adts',
    expectedCodecs: ['aac'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
  {
    id: 'm4a',
    label: 'M4A',
    canonicalMimeType: 'audio/mp4',
    mimeTypes: ['audio/mp4', 'audio/m4a', 'audio/x-m4a'],
    extensions: ['m4a'],
    container: 'iso-base-media',
    expectedCodecs: ['aac', 'alac'],
    uploadSurfaces: ALL_UPLOAD_SURFACES,
    platforms: CURRENT_PLATFORMS,
  },
] as const satisfies readonly AudioFormatDefinition[];

/** 150 MiB. Kept literal so generated cross-platform manifests stay exact. */
export const AUDIO_MAX_FILE_SIZE_BYTES = 157_286_400;

export const AUDIO_UPLOAD_POLICIES = {
  library: {
    maxFileSizeBytes: AUDIO_MAX_FILE_SIZE_BYTES,
    formatIds: AUDIO_FORMAT_IDS,
  },
  chat: {
    maxFileSizeBytes: AUDIO_MAX_FILE_SIZE_BYTES,
    formatIds: AUDIO_FORMAT_IDS,
  },
  promo_download: {
    maxFileSizeBytes: AUDIO_MAX_FILE_SIZE_BYTES,
    formatIds: AUDIO_FORMAT_IDS,
  },
} as const satisfies Readonly<
  Record<
    AudioUploadSurface,
    {
      readonly maxFileSizeBytes: number;
      readonly formatIds: readonly AudioFormatId[];
    }
  >
>;

// Stryker disable all: ESM module initializers execute before Stryker activates
// a mutant. Exact-value invariant tests below the registry still guard these
// derived constants; mutating their callbacks produces false survivors.
export const SUPPORTED_AUDIO_MIME_TYPES = AUDIO_FORMAT_REGISTRY.flatMap(
  format => format.mimeTypes
);

export type SupportedAudioMimeType =
  (typeof AUDIO_FORMAT_REGISTRY)[number]['mimeTypes'][number];

export const SUPPORTED_AUDIO_MIME_TYPES_SET: ReadonlySet<string> = new Set(
  SUPPORTED_AUDIO_MIME_TYPES
);

export const SUPPORTED_AUDIO_EXTENSIONS = AUDIO_FORMAT_REGISTRY.flatMap(
  format => format.extensions
);

export const SUPPORTED_AUDIO_FORMAT_LABELS = AUDIO_FORMAT_REGISTRY.map(
  format => format.label
);

export const AUDIO_FILE_ACCEPT = [
  ...SUPPORTED_AUDIO_MIME_TYPES,
  ...SUPPORTED_AUDIO_EXTENSIONS.map(extension => `.${extension}`),
].join(',');
// Stryker restore all

export interface AudioFileDescriptor {
  readonly name: string;
  readonly type: string;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase().split(';', 1)[0];
}

function extensionFromFileName(fileName: string): string | null {
  const match = fileName
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function getAudioFormatByMimeType(
  mimeType: string
): AudioFormatDefinition | null {
  const normalized = normalizeMimeType(mimeType);
  return (
    AUDIO_FORMAT_REGISTRY.find(format =>
      (format.mimeTypes as readonly string[]).includes(normalized)
    ) ?? null
  );
}

export function getAudioFormatByFileName(
  fileName: string
): AudioFormatDefinition | null {
  const extension = extensionFromFileName(fileName);
  return (
    AUDIO_FORMAT_REGISTRY.find(format =>
      (format.extensions as readonly string[]).includes(extension as string)
    ) ?? null
  );
}

export function getAudioFormat(
  file: AudioFileDescriptor
): AudioFormatDefinition | null {
  const formatByMimeType = getAudioFormatByMimeType(file.type);
  if (formatByMimeType) return formatByMimeType;

  const normalizedMimeType = normalizeMimeType(file.type);
  if (
    normalizedMimeType.length > 0 &&
    normalizedMimeType !== 'application/octet-stream'
  ) {
    return null;
  }

  return getAudioFormatByFileName(file.name);
}

export function isSupportedAudioMimeType(mimeType: string): boolean {
  return SUPPORTED_AUDIO_MIME_TYPES_SET.has(normalizeMimeType(mimeType));
}

export function isSupportedAudioFile(file: AudioFileDescriptor): boolean {
  return getAudioFormat(file) !== null;
}

export function getCanonicalAudioMimeType(fileName: string): string | null {
  return getAudioFormatByFileName(fileName)?.canonicalMimeType ?? null;
}

export function getCanonicalAudioUploadMimeType(
  file: AudioFileDescriptor
): string | null {
  return getAudioFormat(file)?.canonicalMimeType ?? null;
}

export function getAudioFormatLabel(mimeType: string): string {
  return getAudioFormatByMimeType(mimeType)?.label ?? 'Audio';
}

declare const audioUnitBrand: unique symbol;

export type Milliseconds = number & {
  readonly [audioUnitBrand]: 'milliseconds';
};
export type Seconds = number & { readonly [audioUnitBrand]: 'seconds' };
export type Percent = number & { readonly [audioUnitBrand]: 'percent' };
export type Bpm = number & { readonly [audioUnitBrand]: 'bpm' };

function requireFiniteNonNegative(value: number, unit: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${unit} must be a finite, non-negative number`);
  }
  return value;
}

export function milliseconds(value: number): Milliseconds {
  return requireFiniteNonNegative(value, 'milliseconds') as Milliseconds;
}

export function seconds(value: number): Seconds {
  return requireFiniteNonNegative(value, 'seconds') as Seconds;
}

export function percent(value: number): Percent {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('percent must be between 0 and 100');
  }
  return value as Percent;
}

export function bpm(value: number): Bpm {
  if (!Number.isFinite(value) || value <= 0 || value > 400) {
    throw new RangeError('bpm must be greater than 0 and at most 400');
  }
  return value as Bpm;
}

export function millisecondsToSeconds(value: Milliseconds): Seconds {
  return seconds(value / 1000);
}

export function secondsToMilliseconds(value: Seconds): Milliseconds {
  return milliseconds(value * 1000);
}
