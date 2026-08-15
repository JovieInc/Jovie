export type AudioBlobSurface = 'library' | 'chat' | 'promo_download';

const JOVIE_AUDIO_PATH_PREFIX = 'jovie/audio';

export function buildAudioBlobPath(
  surface: AudioBlobSurface,
  userId: string,
  fileName: string
): string {
  if (userId === 'unknown') return fileName;
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
    'audio';
  return `${JOVIE_AUDIO_PATH_PREFIX}/${surface}/${encodeURIComponent(userId)}/${crypto.randomUUID()}-${safeName}`;
}

export function getAudioBlobPathPrefix(
  surface: AudioBlobSurface,
  userId: string
): string {
  return `${JOVIE_AUDIO_PATH_PREFIX}/${surface}/${encodeURIComponent(userId)}/`;
}
