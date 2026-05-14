/**
 * Social platform utility functions for waitlist and onboarding flows.
 *
 * This module consolidates platform detection and handle extraction logic
 * that was previously duplicated across waitlist submission and admin approval routes.
 */

import { normalizeUrl } from './platform-detection';

export interface PlatformDetectionResult {
  platform: string;
  normalizedUrl: string;
}

/**
 * Detect social media platform from a URL.
 *
 * This function identifies which social media platform a URL belongs to
 * and returns both the platform name and normalized URL.
 *
 * Supported platforms:
 * - Instagram
 * - TikTok
 * - YouTube
 * - X (Twitter)
 * - Twitch
 * - Linktree
 * - Facebook
 * - Threads
 * - Snapchat
 *
 * @param url - Social media profile URL
 * @returns Object containing platform name and normalized URL
 *
 * @example
 * detectPlatformFromUrl('https://instagram.com/user')
 * // returns { platform: 'instagram', normalizedUrl: '...' }
 */
export function detectPlatformFromUrl(url: string): PlatformDetectionResult {
  const normalizedUrl = normalizeUrl(url);

  const platformPatterns: Array<{ pattern: RegExp; platform: string }> = [
    { pattern: /(?:www\.)?instagram\.com/i, platform: 'instagram' },
    { pattern: /(?:www\.)?tiktok\.com/i, platform: 'tiktok' },
    { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platform: 'youtube' },
    { pattern: /(?:twitter\.com|x\.com)/i, platform: 'x' },
    { pattern: /(?:www\.)?twitch\.tv/i, platform: 'twitch' },
    { pattern: /(?:linktr\.ee|linktree\.com)/i, platform: 'linktree' },
    { pattern: /(?:www\.)?facebook\.com/i, platform: 'facebook' },
    { pattern: /(?:www\.)?threads\.net/i, platform: 'threads' },
    { pattern: /(?:www\.)?snapchat\.com/i, platform: 'snapchat' },
  ];

  for (const { pattern, platform } of platformPatterns) {
    if (pattern.test(normalizedUrl)) {
      return { platform, normalizedUrl };
    }
  }

  return { platform: 'unknown', normalizedUrl };
}

/**
 * Platform-specific configuration for handle extraction.
 */
interface PlatformHandleConfig {
  hosts: string[];
  requiresAtSymbol: boolean;
}

/**
 * Platform configurations for handle extraction.
 * Centralizes host lists and extraction rules.
 */
const PLATFORM_CONFIGS: Record<string, PlatformHandleConfig> = {
  instagram: {
    hosts: ['instagram.com', 'www.instagram.com'],
    requiresAtSymbol: false,
  },
  tiktok: {
    hosts: ['tiktok.com', 'www.tiktok.com'],
    requiresAtSymbol: false,
  },
  youtube: {
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    requiresAtSymbol: true,
  },
  x: {
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    requiresAtSymbol: false,
  },
  linktree: {
    hosts: ['linktr.ee', 'www.linktr.ee'],
    requiresAtSymbol: false,
  },
  threads: {
    hosts: ['threads.net', 'www.threads.net'],
    requiresAtSymbol: false,
  },
  facebook: {
    hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
    requiresAtSymbol: false,
  },
  twitch: {
    hosts: ['twitch.tv', 'www.twitch.tv'],
    requiresAtSymbol: false,
  },
  snapchat: {
    hosts: ['snapchat.com', 'www.snapchat.com'],
    requiresAtSymbol: false,
  },
};

/**
 * Resolve the first meaningful path segment for a given host,
 * skipping known non-handle prefixes like snapchat.com/add.
 * Returns null when the URL cannot yield a handle.
 */
function resolveHandleSegment(host: string, segments: string[]): string | null {
  const first = segments[0];
  if (host.includes('snapchat.com') && first === 'add')
    return segments[1] ?? null;
  if (
    host.includes('facebook.com') &&
    (first === 'profile.php' || first === 'pages')
  )
    return null;
  return first ?? null;
}

/**
 * Extract username/handle from a social media URL.
 *
 * This function attempts to parse a social media URL and extract the username
 * or handle. Different platforms have different URL structures, so this function
 * handles the most common patterns for each platform.
 *
 * Extraction patterns:
 * - Instagram: instagram.com/username → username
 * - TikTok: tiktok.com/@username → username
 * - YouTube: youtube.com/@channel → channel
 * - Linktree: linktr.ee/username → username
 *
 * @param urlRaw - Raw social media profile URL
 * @returns Extracted handle/username, or null if unable to extract
 *
 * @example
 * extractHandleFromUrl('https://instagram.com/@testuser')
 * // returns 'testuser'
 *
 * extractHandleFromUrl('https://youtube.com/@channelname')
 * // returns 'channelname'
 */
export function extractHandleFromUrl(urlRaw: string): string | null {
  try {
    const url = new URL(urlRaw);
    const host = url.hostname.toLowerCase();

    // Find matching platform configuration
    for (const config of Object.values(PLATFORM_CONFIGS)) {
      if (!config.hosts.includes(host)) continue;

      const segments = url.pathname.split('/').filter(Boolean);
      const seg = resolveHandleSegment(host, segments);
      if (!seg) return null;

      // YouTube requires @ symbol, others allow it optionally
      if (config.requiresAtSymbol) {
        return seg.startsWith('@') ? seg.slice(1) : null;
      }

      // Strip @ symbol if present
      return seg.replace(/^@/, '');
    }

    // Unsupported platform or unable to extract
    return null;
  } catch {
    // Invalid URL
    return null;
  }
}

/**
 * Strip trailing forward slashes from a path without using regex.
 *
 * Avoids the regex-DoS analyzer false-positive on `/\/+$/` and is
 * faster: a tight loop with index math instead of regex backtracking
 * machinery. Bounded by string length, never re-enters.
 */
function stripTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47 /* '/' */) end -= 1;
  return end === path.length ? path : path.slice(0, end);
}

/**
 * Strip a leading `www.` host prefix without using regex.
 *
 * Mirrors `stripTrailingSlashes`: index check + slice, no backtracking.
 */
function stripLeadingWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/**
 * Produce a stable key for deduping a link by `(platform, url)`.
 *
 * Two URLs that resolve to the same destination on the same platform
 * (trailing slash, casing, `www.` prefix, fragment noise) must collapse
 * to the same key. The query string is preserved (lowercased): URLs
 * like `facebook.com/profile.php?id=1` and `…?id=2` are distinct
 * destinations and must NOT collapse (CodeRabbit JOV-2149 review).
 *
 * Invalid URLs fall back to the trimmed raw string so we don't drop
 * rows we can't parse.
 */
function dedupeKey(platform: string, urlRaw: string): string {
  const p = platform.trim().toLowerCase();
  try {
    const u = new URL(urlRaw);
    const host = stripLeadingWww(u.hostname.toLowerCase());
    const path = stripTrailingSlashes(u.pathname).toLowerCase();
    // Preserve query components — `?id=1` vs `?id=2` are distinct.
    const search = u.search.toLowerCase();
    return `${p}|${host}${path}${search}`;
  } catch {
    return `${p}|${urlRaw.trim().toLowerCase()}`;
  }
}

/**
 * Deduplicate a list of links by `(platform, normalized-url)`.
 *
 * - Preserves the first occurrence of each unique key (input order stable).
 * - Multiple legitimate channels on the same platform with different URLs
 *   (e.g. two distinct YouTube channels) are kept.
 * - Identical or near-identical rows (trailing slash, casing, www prefix)
 *   collapse to a single row.
 * - Pure: never mutates input, never invents output.
 */
export function dedupeLinks<L extends { platform: string; url: string }>(
  links: readonly L[]
): L[] {
  const seen = new Set<string>();
  const out: L[] = [];
  for (const link of links) {
    const key = dedupeKey(link.platform, link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}
