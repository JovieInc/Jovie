const PROMO_DOWNLOAD_AUDIO_PREFIX = 'promo-downloads';

function baseFileName(fileName: string): string {
  return fileName.split(/[\\/]/).at(-1)?.trim() || 'audio';
}

export function getPromoDownloadAudioUploadPath(
  releaseId: string,
  fileName: string
): string {
  return `${PROMO_DOWNLOAD_AUDIO_PREFIX}/${releaseId}/${baseFileName(fileName)}`;
}

export function isPromoDownloadAudioUploadPath(
  releaseId: string,
  pathname: string
): boolean {
  const prefix = `${PROMO_DOWNLOAD_AUDIO_PREFIX}/${releaseId}/`;
  const suffix = pathname.slice(prefix.length);
  return (
    pathname.startsWith(prefix) && suffix.length > 0 && !suffix.includes('/')
  );
}
