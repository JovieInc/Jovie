/** Maximum audio upload size (150 MB), aligned with library uploads. */
export const AUDIO_MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-aiff',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
] as const;

export type SupportedAudioMimeType =
  (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

export const SUPPORTED_AUDIO_MIME_TYPES_SET = new Set<string>(
  SUPPORTED_AUDIO_MIME_TYPES
);

export const AUDIO_FILE_ACCEPT = SUPPORTED_AUDIO_MIME_TYPES.join(',');

/** Human labels for supported container formats (UI copy). */
export const SUPPORTED_AUDIO_FORMAT_LABELS = [
  'MP3',
  'WAV',
  'FLAC',
  'AIFF',
  'AAC',
  'M4A',
] as const;

/** @deprecated Prefer AUDIO_FILE_ACCEPT */
export const AUDIO_ACCEPT = AUDIO_FILE_ACCEPT;

/** @deprecated Prefer SUPPORTED_AUDIO_MIME_TYPES_SET */
export const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_AUDIO_MIME_TYPES_SET;

const AUDIO_EXTENSION_PATTERN = /\.(aac|aiff?|flac|m4a|mp3|wav)$/i;

/** Named-rule codes for rejected audio uploads (JOV-3688). */
export type AudioUploadRuleCode =
  | 'audio.supported_types'
  | 'audio.max_file_size_bytes';

export type AudioUploadCtaAction = 'pick_another' | 'request_type' | 'compress';

export interface AudioUploadRejection {
  readonly ok: false;
  /** Stable machine id for telemetry + tests */
  readonly code: AudioUploadRuleCode;
  /** Named rule shown inline (plain language) */
  readonly rule: string;
  /** Full user-facing sentence */
  readonly message: string;
  readonly cta: {
    readonly label: string;
    readonly action: AudioUploadCtaAction;
  };
}

export type AudioUploadValidationResult =
  | { readonly ok: true }
  | AudioUploadRejection;

export function isSupportedAudioFile(
  file: Pick<File, 'name' | 'type'>
): boolean {
  if (SUPPORTED_AUDIO_MIME_TYPES_SET.has(file.type)) {
    return true;
  }

  return AUDIO_EXTENSION_PATTERN.test(file.name);
}

function formatMaxSizeMb(maxSizeBytes: number): number {
  return Math.round(maxSizeBytes / (1024 * 1024));
}

function describeRejectedType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type && file.type.length > 0) {
    return file.type;
  }
  const match = file.name.match(/\.([^.]+)$/);
  return match?.[1] ? `.${match[1].toLowerCase()}` : 'unknown type';
}

/**
 * Structured audio upload validation with a named failing rule + CTA.
 * Prefer this over `validateAudioFile` for UI surfaces (JOV-3688).
 */
export function validateAudioUpload(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxSizeBytes = AUDIO_MAX_FILE_SIZE_BYTES
): AudioUploadValidationResult {
  if (!isSupportedAudioFile(file)) {
    const rejected = describeRejectedType(file);
    const formats = SUPPORTED_AUDIO_FORMAT_LABELS.join(', ');
    return {
      ok: false,
      code: 'audio.supported_types',
      rule: `Supported types: ${formats}`,
      message: `${rejected} is not supported. Use ${formats}.`,
      cta: {
        label: 'Choose another file',
        action: 'pick_another',
      },
    };
  }

  if (file.size > maxSizeBytes) {
    const maxMb = formatMaxSizeMb(maxSizeBytes);
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      code: 'audio.max_file_size_bytes',
      rule: `Max file size: ${maxMb} MB`,
      message: `This file is ${fileMb} MB. Audio must be ${maxMb} MB or smaller.`,
      cta: {
        label: 'Choose a smaller file',
        action: 'compress',
      },
    };
  }

  return { ok: true };
}

/**
 * Legacy string validator. Returns the structured message or null when valid.
 * Prefer `validateAudioUpload` for new call sites.
 */
export function validateAudioFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxSizeBytes = AUDIO_MAX_FILE_SIZE_BYTES
): string | null {
  const result = validateAudioUpload(file, maxSizeBytes);
  return result.ok ? null : result.message;
}

export function parseAudioTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const normalized = withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 0 ? normalized : 'Untitled track';
}
