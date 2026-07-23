import {
  AUDIO_FILE_ACCEPT,
  AUDIO_MAX_FILE_SIZE_BYTES,
  getCanonicalAudioUploadMimeType,
  isSupportedAudioFile,
  SUPPORTED_AUDIO_FORMAT_LABELS,
  SUPPORTED_AUDIO_MIME_TYPES_SET,
} from '@jovie/audio-contracts';

export type {
  AudioFileDescriptor,
  AudioFormatDefinition,
  AudioFormatId,
  AudioPlatform,
  AudioUploadSurface,
  Bpm,
  Milliseconds,
  Percent,
  Seconds,
  SupportedAudioMimeType,
} from '@jovie/audio-contracts';
export {
  AUDIO_FILE_ACCEPT,
  AUDIO_FORMAT_REGISTRY,
  AUDIO_MAX_FILE_SIZE_BYTES,
  AUDIO_UPLOAD_POLICIES,
  getAudioFormat,
  getAudioFormatByFileName,
  getAudioFormatByMimeType,
  getAudioFormatLabel,
  getCanonicalAudioMimeType,
  getCanonicalAudioUploadMimeType,
  isSupportedAudioFile,
  isSupportedAudioMimeType,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_AUDIO_FORMAT_LABELS,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES_SET,
} from '@jovie/audio-contracts';

/** @deprecated Prefer AUDIO_FILE_ACCEPT */
export const AUDIO_ACCEPT = AUDIO_FILE_ACCEPT;

/** @deprecated Prefer SUPPORTED_AUDIO_MIME_TYPES_SET */
export const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_AUDIO_MIME_TYPES_SET;

/** Gives Blob uploads a canonical MIME when browsers omit or alias it. */
export function canonicalizeAudioFileForUpload(file: File): File {
  const canonicalMimeType = getCanonicalAudioUploadMimeType(file);
  if (!canonicalMimeType || file.type === canonicalMimeType) return file;

  return new File([file], file.name, {
    type: canonicalMimeType,
    lastModified: file.lastModified,
  });
}

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

/** Structured upload validation with named failing rule + CTA (JOV-3688). */
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

/** Legacy string validator; prefer `validateAudioUpload` for UI. */
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
