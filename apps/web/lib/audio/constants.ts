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

/** @deprecated Prefer AUDIO_FILE_ACCEPT */
export const AUDIO_ACCEPT = AUDIO_FILE_ACCEPT;

/** @deprecated Prefer SUPPORTED_AUDIO_MIME_TYPES_SET */
export const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_AUDIO_MIME_TYPES_SET;

const AUDIO_EXTENSION_PATTERN = /\.(aac|aiff?|flac|m4a|mp3|wav)$/i;

export function isSupportedAudioFile(
  file: Pick<File, 'name' | 'type'>
): boolean {
  if (SUPPORTED_AUDIO_MIME_TYPES_SET.has(file.type)) {
    return true;
  }

  return AUDIO_EXTENSION_PATTERN.test(file.name);
}

export function validateAudioFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxSizeBytes = AUDIO_MAX_FILE_SIZE_BYTES
): string | null {
  if (!isSupportedAudioFile(file)) {
    return 'Use MP3, WAV, FLAC, AIFF, AAC, or M4A audio.';
  }

  if (file.size > maxSizeBytes) {
    return 'Audio must be 150 MB or smaller.';
  }

  return null;
}

export function parseAudioTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const normalized = withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 0 ? normalized : 'Untitled track';
}