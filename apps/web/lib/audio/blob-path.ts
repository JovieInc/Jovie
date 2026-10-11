export type AudioBlobSurface = 'library' | 'chat' | 'promo_download';

const JOVIE_AUDIO_PATH_PREFIX = 'jovie/audio';

/**
 * Owner-scoped Blob path layout shared by every upload surface (audio, chat
 * files, account video): `<pathPrefix>/<surface>/<userId>/<uuid>-<safe-name>`.
 * Kept generic so `lib/media/file-policy.ts` composes it instead of
 * reimplementing the same sanitize + prefix logic.
 */
export function getScopedBlobPathPrefix(
  pathPrefix: string,
  surface: string,
  userId: string
): string {
  return `${pathPrefix}/${surface}/${encodeURIComponent(userId)}/`;
}

export function buildScopedBlobPath(
  pathPrefix: string,
  surface: string,
  userId: string,
  fileName: string,
  fallbackName: string
): string {
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
    fallbackName;
  return `${getScopedBlobPathPrefix(pathPrefix, surface, userId)}${crypto.randomUUID()}-${safeName}`;
}

export function buildAudioBlobPath(
  surface: AudioBlobSurface,
  userId: string,
  fileName: string
): string {
  if (userId === 'unknown') return fileName;
  return buildScopedBlobPath(
    JOVIE_AUDIO_PATH_PREFIX,
    surface,
    userId,
    fileName,
    'audio'
  );
}

export function getAudioBlobPathPrefix(
  surface: AudioBlobSurface,
  userId: string
): string {
  return getScopedBlobPathPrefix(JOVIE_AUDIO_PATH_PREFIX, surface, userId);
}
