/**
 * Normalize a file attachment URL or name into a human-readable label.
 * Strips blob hosts, query/hash, URL-decodes, and middle-ellipsizes long names.
 * JOV-3492.
 */

const BLOB_HOST_PATTERN = /\.blob\.vercel-storage\.com$/i;
const MAX_DISPLAY_LENGTH = 40;

export function isVercelBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return BLOB_HOST_PATTERN.test(host) || host === 'blob.vercel-storage.com';
  } catch {
    return url.includes('blob.vercel-storage.com');
  }
}

export function filenameFromUrlOrName(
  url: string,
  name?: string | null
): string {
  const raw = name?.trim() || extractPathBasename(url) || 'File';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  // Collapse leftover percent-encoding noise and path separators.
  decoded = decoded
    .replaceAll('+', ' ')
    .replaceAll(/[\\/]+/g, ' ')
    .trim();
  return decoded.length > 0 ? decoded : 'File';
}

function extractPathBasename(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split('/').filter(Boolean).at(-1);
    return segment ?? null;
  } catch {
    const withoutQuery = url.split(/[?#]/u)[0] ?? url;
    const segment = withoutQuery.split('/').filter(Boolean).at(-1);
    return segment ?? null;
  }
}

export function middleEllipsis(
  value: string,
  maxLength: number = MAX_DISPLAY_LENGTH
): string {
  if (value.length <= maxLength) return value;
  const keep = Math.max(4, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function fileDisplayName(
  url: string,
  name?: string | null,
  maxLength: number = MAX_DISPLAY_LENGTH
): string {
  return middleEllipsis(filenameFromUrlOrName(url, name), maxLength);
}

export type TranscriptFileKind =
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'document'
  | 'other';

export function fileKindFromMediaType(
  mediaType: string | null | undefined,
  filename?: string | null
): TranscriptFileKind {
  const type = (mediaType ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (
    type.includes('zip') ||
    type.includes('rar') ||
    type.includes('7z') ||
    type.includes('tar') ||
    type.includes('gzip')
  ) {
    return 'archive';
  }
  if (
    type.includes('pdf') ||
    type.startsWith('text/') ||
    type.includes('document') ||
    type.includes('msword') ||
    type.includes('officedocument')
  ) {
    return 'document';
  }

  const ext = (filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(ext)
  ) {
    return 'image';
  }
  if (['mp3', 'wav', 'flac', 'aac', 'aiff', 'm4a', 'ogg'].includes(ext)) {
    return 'audio';
  }
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['pdf', 'txt', 'md', 'doc', 'docx'].includes(ext)) return 'document';
  return 'other';
}
