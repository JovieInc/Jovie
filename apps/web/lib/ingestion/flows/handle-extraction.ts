/**
 * Handle Extraction Flow
 *
 * Platform-specific strategies for extracting usernames/handles
 * from social platform URLs.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection/normalizer';

/**
 * Platform-specific handle extraction strategies.
 * Maps hostname patterns to extraction logic for different social platforms.
 */
export const PLATFORM_EXTRACTION_STRATEGIES: Record<
  string,
  {
    hosts: string[];
    extract: (segments: string[]) => string | null;
  }
> = {
  youtube: {
    hosts: ['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle @username or /channel/ID or /c/name or /user/name
      if (handle?.startsWith('@')) {
        return handle.slice(1);
      }
      if (
        (handle === 'channel' || handle === 'c' || handle === 'user') &&
        segments[1]
      ) {
        return segments[1];
      }
      return handle ?? null;
    },
  },
  tiktok: {
    hosts: ['tiktok.com', 'www.tiktok.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle @username format
      return handle?.startsWith('@') ? handle.slice(1) : (handle ?? null);
    },
  },
  linkedin: {
    hosts: ['linkedin.com', 'www.linkedin.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /in/username or /company/name
      if ((handle === 'in' || handle === 'company') && segments[1]) {
        return segments[1];
      }
      return handle ?? null;
    },
  },
  reddit: {
    hosts: ['reddit.com', 'www.reddit.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /user/username or /u/username
      if ((handle === 'user' || handle === 'u') && segments[1]) {
        return segments[1];
      }
      return handle ?? null;
    },
  },
  spotify: {
    hosts: ['spotify.com', 'www.spotify.com', 'open.spotify.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /artist/ID or /user/username
      if (handle === 'artist' && segments[1]) {
        // Store the full artist ID with prefix for later API lookup
        return `artist-${segments[1]}`;
      }
      if (handle === 'user' && segments[1]) {
        return segments[1];
      }
      // Playlists aren't creator profiles
      if (handle === 'playlist') {
        return null;
      }
      return handle ?? null;
    },
  },
};

/**
 * Extract username/handle from a social platform URL.
 * Uses platform-specific strategies to handle different URL formats.
 *
 * @param url - Social platform profile URL
 * @returns Extracted handle/username, or null if extraction fails
 */
export function extractHandleFromSocialUrl(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    const hostname = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    // Find matching platform strategy
    const strategy = Object.values(PLATFORM_EXTRACTION_STRATEGIES).find(s =>
      s.hosts.includes(hostname)
    );

    // Extract handle using platform strategy or fallback to first segment
    let handle = strategy ? strategy.extract(segments) : segments[0];

    if (!handle) {
      return null;
    }

    // Spotify artist IDs are case-sensitive base62 strings; preserve case for `artist-*`.
    const isSpotifyArtist = handle.startsWith('artist-');

    // Clean up the handle
    handle = handle
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[?#].*/, ''); // Remove query strings/fragments (safe: greedy match, no backtracking)

    if (!isSpotifyArtist) {
      handle = handle.toLowerCase();
    }

    // Validate handle format (30 char limit to match downstream validation)
    if (handle.length > 30) {
      return null;
    }

    // Validate handle format based on type
    const validPattern = isSpotifyArtist
      ? /^artist-[A-Za-z0-9]+$/ // Spotify: base62 artist IDs with `artist-` prefix
      : /^[a-z0-9._-]+$/; // Standard: alphanumeric, underscores, hyphens, periods

    if (!validPattern.test(handle)) return null;

    return handle;
  } catch {
    return null;
  }
}
