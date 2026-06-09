export const AUDIO_MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

export const AUDIO_ACCEPT =
  'audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/mp4,audio/x-m4a';

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
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
]);

const AUDIO_EXTENSION_PATTERN = /\.(aac|aiff?|flac|m4a|mp3|wav)$/i;

export function isSupportedAudioFile(file: File): boolean {
  if (ALLOWED_AUDIO_MIME_TYPES.has(file.type)) return true;
  return AUDIO_EXTENSION_PATTERN.test(file.name);
}
