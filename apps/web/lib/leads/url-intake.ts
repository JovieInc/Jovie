import { extractLinktreeHandle } from '@/lib/ingestion/strategies/linktree';

export type IntakeUrlKind =
  | 'linktree'
  | 'spotify'
  | 'instagram'
  | 'apple_music'
  | 'website';

export interface LeadSeed {
  kind: IntakeUrlKind;
  normalizedUrl: string;
  handle: string;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
}

const HANDLE_SANITIZE_REGEX = /[^a-z0-9_-]/g;

export function classifyUrlKind(url: string): IntakeUrlKind {
  const host = getHostname(url);

  if (host.includes('linktr.ee')) return 'linktree';
  if (host.includes('spotify.com')) return 'spotify';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('music.apple.com')) return 'apple_music';
  return 'website';
}

export function seedLeadFromUrl(rawUrl: string): LeadSeed | null {
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) return null;

  const kind = classifyUrlKind(normalizedUrl);
  const handle =
    kind === 'linktree'
      ? extractLinktreeHandle(normalizedUrl)
      : deriveHandleFromUrl(normalizedUrl);

  if (!handle) return null;

  if (kind === 'instagram') {
    return {
      kind,
      normalizedUrl,
      handle,
      hasSpotifyLink: false,
      spotifyUrl: null,
      hasInstagram: true,
      instagramHandle: handle,
    };
  }

  if (kind === 'spotify') {
    return {
      kind,
      normalizedUrl,
      handle,
      hasSpotifyLink: true,
      spotifyUrl: normalizedUrl,
      hasInstagram: false,
      instagramHandle: null,
    };
  }

  return {
    kind,
    normalizedUrl,
    handle,
    hasSpotifyLink: false,
    spotifyUrl: null,
    hasInstagram: false,
    instagramHandle: null,
  };
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.toString();
  } catch {
    return null;
  }
}

function deriveHandleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathSegment = parsed.pathname.split('/').filter(Boolean).at(-1);
    const fallback = `${parsed.hostname}-${pathSegment ?? 'profile'}`;
    const normalized = fallback
      .toLowerCase()
      .replace(HANDLE_SANITIZE_REGEX, '');
    return normalized.length > 0 ? normalized.slice(0, 64) : null;
  } catch {
    return null;
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
