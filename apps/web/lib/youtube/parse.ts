/**
 * YouTube URL Parser
 *
 * Extracts video IDs from YouTube URLs with hostname validation.
 * Uses the URL API to parse, then validates hostname against an allowlist
 * before extracting the 11-character video ID.
 */

export interface ParsedYouTubeUrl {
  videoId: string;
  url: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Parse a YouTube URL and extract the video ID.
 * Returns null for invalid or non-YouTube URLs.
 */
export function parseYouTubeUrl(url: string): ParsedYouTubeUrl | null {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return null;

    let candidate: string | null = null;

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      candidate = parsed.pathname.split('/').find(Boolean) ?? null;
    } else {
      candidate = parsed.searchParams.get('v');
      if (!candidate) {
        const pathMatch = /^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})\/?$/.exec(
          parsed.pathname
        );
        candidate = pathMatch?.[1] ?? null;
      }
    }

    if (candidate && VIDEO_ID_RE.test(candidate)) {
      return { videoId: candidate, url: url.trim() };
    }
  } catch {
    return null;
  }

  return null;
}
