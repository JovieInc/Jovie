export const ACCOUNT_VIDEO_UPLOAD_PATH = '/api/chat/files/upload-token';

export function isAccountVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.blob.vercel-storage.com') ||
        parsed.hostname.endsWith('.public.blob.vercel-storage.com'))
    );
  } catch {
    return false;
  }
}

export function captureVideoFileName(
  purpose: string,
  recordedAt: Date
): string {
  const stamp = recordedAt.toISOString().replace(/[:.]/g, '-');
  return `${purpose}-${stamp}.webm`;
}
