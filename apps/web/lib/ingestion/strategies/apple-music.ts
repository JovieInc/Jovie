/**
 * Apple Music Artist Ingestion Strategy
 *
 * Extracts artist data and links from Apple Music artist pages.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

import {
  canonicalIdentity,
  normalizeUrl,
  validateLink,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
} from './base';

// ============================================================================
// Configuration
// ============================================================================

export const APPLE_MUSIC_CONFIG: StrategyConfig = {
  platformId: 'apple_music',
  platformName: 'Apple Music',
  canonicalHost: 'music.apple.com',
  validHosts: new Set(['music.apple.com', 'www.music.apple.com']),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal Apple Music navigation)
export const SKIP_HOSTS = new Set([
  'music.apple.com',
  'www.music.apple.com',
  // Apple CDN and asset domains
  'is1-ssl.mzstatic.com',
  'is2-ssl.mzstatic.com',
  'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com',
  'is5-ssl.mzstatic.com',
  'mzstatic.com',
  'ssl.mzstatic.com',
  // Other Apple domains
  'apple.com',
  'www.apple.com',
  'support.apple.com',
  'itunes.apple.com',
  // Apple internal/app links
  'apps.apple.com',
]);

// Apple Music artist URL pattern: https://music.apple.com/{region}/artist/{artist-name}/{artist-id}
// Region is typically 2 letters (us, uk, jp, etc.) but can be longer (e.g., "gb" for UK)
// Artist ID is numeric
const ARTIST_URL_PATTERN =
  /^https:\/\/(www\.)?music\.apple\.com\/([a-z]{2,3})\/artist\/([^/?#]+)\/(\d+)/i;

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Apple Music artist URL.
 */
export function isAppleMusicUrl(url: string): boolean {
  try {
    const candidate = url.trim();

    // Reject dangerous or unsupported schemes early
    if (/^(javascript|data|vbscript|file|ftp):/i.test(candidate)) {
      return false;
    }

    // Reject protocol-relative URLs
    if (candidate.startsWith('//')) {
      return false;
    }

    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    if (originalParsed.protocol !== 'https:') {
      return false;
    }

    const normalized = normalizeUrl(candidate);
    const parsed = new URL(normalized);

    if (!APPLE_MUSIC_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    // Must match artist URL pattern
    return ARTIST_URL_PATTERN.test(normalized);
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes an Apple Music artist URL.
 * Returns null if invalid.
 */
export function validateAppleMusicUrl(url: string): string | null {
  try {
    const candidate = url.trim();

    // Reject dangerous or unsupported schemes early
    if (/^(javascript|data|vbscript|file|ftp):/i.test(candidate)) {
      return null;
    }

    // Reject protocol-relative URLs
    if (candidate.startsWith('//')) {
      return null;
    }

    // Check original URL protocol before normalization
    const originalParsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    if (originalParsed.protocol !== 'https:') {
      return null;
    }

    const normalized = normalizeUrl(candidate);
    const parsed = new URL(normalized);

    if (!APPLE_MUSIC_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    // Extract artist info using pattern
    const match = ARTIST_URL_PATTERN.exec(normalized);
    if (!match) {
      return null;
    }

    const [, , region, artistSlug, artistId] = match;

    // Return canonical URL format (without www)
    return `https://${APPLE_MUSIC_CONFIG.canonicalHost}/${region.toLowerCase()}/artist/${artistSlug.toLowerCase()}/${artistId}`;
  } catch {
    return null;
  }
}

/**
 * Extracts the artist ID from an Apple Music artist URL.
 * Returns null if the URL is invalid or doesn't contain an artist ID.
 */
export function extractAppleMusicArtistId(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!APPLE_MUSIC_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const match = ARTIST_URL_PATTERN.exec(normalized);
    if (!match) {
      return null;
    }

    // Artist ID is the 4th capture group (index 4)
    return match[4];
  } catch {
    return null;
  }
}

/**
 * Fetches an Apple Music artist page document with proper error handling.
 *
 * @param sourceUrl - The Apple Music artist URL to fetch
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns The HTML content of the page
 * @throws {ExtractionError} On fetch failure, timeout, or invalid response
 */
export async function fetchAppleMusicDocument(
  sourceUrl: string,
  timeoutMs = APPLE_MUSIC_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateAppleMusicUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Apple Music URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      // Apple Music may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: APPLE_MUSIC_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Extracts artist data and links from Apple Music HTML.
 *
 * Handles multiple extraction methods:
 * 1. Open Graph / Twitter meta tags for display name and avatar
 * 2. JSON-LD structured data (MusicGroup/Person)
 * 3. href attributes for external links (social profiles)
 */
export function extractAppleMusic(html: string): ExtractionResult {
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();

  const addLink = (
    rawUrl: string | undefined | null,
    title?: string | null
  ) => {
    if (!rawUrl) return;

    try {
      const normalizedUrl = normalizeUrl(rawUrl);
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== 'https:') return;
      if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return;

      const detected = validateLink(normalizedUrl);
      if (!detected || !detected.isValid) return;

      const key = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      if (seen.has(key)) return;
      seen.add(key);

      links.push({
        url: detected.normalizedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle ?? title ?? undefined,
        sourcePlatform: 'apple_music',
        evidence: {
          sources: ['apple_music'],
          signals: ['apple_music_artist_link'],
        },
      });
    } catch {
      return;
    }
  };

  // Try extracting structured links from JSON-LD
  const structuredLinks = extractAppleMusicStructuredLinks(html);
  for (const link of structuredLinks) {
    addLink(link.url, link.title);
  }

  // Fallback: extract all href attributes
  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'apple_music',
    sourceSignal: 'apple_music_artist_link',
  });

  for (const link of fallbackLinks) {
    addLink(link.url, link.title);
  }

  // Extract display name from meta tags
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " - Apple Music" or similar suffixes)
  if (displayName) {
    displayName = cleanAppleMusicDisplayName(displayName);
  }

  // Try to get display name from JSON-LD if meta tags didn't work
  if (!displayName) {
    const jsonLdData = extractAppleMusicJsonLd(html);
    if (jsonLdData?.name) {
      displayName = jsonLdData.name;
    }
  }

  // Extract avatar from meta tags
  let avatarUrl =
    sanitizeImageUrl(extractMetaContent(html, 'og:image')) ??
    sanitizeImageUrl(extractMetaContent(html, 'twitter:image')) ??
    null;

  // Skip default Apple Music placeholder images
  if (avatarUrl && isDefaultAppleMusicImage(avatarUrl)) {
    avatarUrl = null;
  }

  // Try to get avatar from JSON-LD if meta tags didn't work
  if (!avatarUrl) {
    const jsonLdData = extractAppleMusicJsonLd(html);
    if (jsonLdData?.image && !isDefaultAppleMusicImage(jsonLdData.image)) {
      avatarUrl = sanitizeImageUrl(jsonLdData.image);
    }
  }

  return createExtractionResult(links, displayName, avatarUrl);
}

// ============================================================================
// Internal Helpers
// ============================================================================

type StructuredLink = { url?: string | null; title?: string | null };

/**
 * Cleans up Apple Music display name by removing platform suffixes.
 */
function cleanAppleMusicDisplayName(name: string): string {
  return (
    name
      // Handle " - Apple Music" and variations
      .replace(/\s*[-–—]\s*Apple\s*Music$/i, '')
      // Handle " | Apple Music" and variations
      .replace(/\s*\|\s*Apple\s*Music$/i, '')
      // Handle " on Apple Music"
      .replace(/\s+on\s+Apple\s*Music$/i, '')
      // Handle just "Apple Music" at the end
      .replace(/\s+Apple\s*Music$/i, '')
      .trim()
  );
}

/**
 * Sanitizes an image URL to ensure it's a valid HTTPS URL.
 */
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Checks if an image URL is a default Apple Music placeholder image.
 */
function isDefaultAppleMusicImage(url: string): boolean {
  const defaultPatterns = [
    /default[-_]?avatar/i,
    /placeholder/i,
    /apple[-_]?music[-_]?logo/i,
    /default[-_]?artist/i,
    /generic[-_]?artist/i,
  ];

  return defaultPatterns.some(pattern => pattern.test(url));
}

interface AppleMusicJsonLd {
  '@type'?: string;
  name?: string;
  image?: string | { url?: string };
  url?: string;
  sameAs?: string | string[];
}

/**
 * Attempts to extract data from JSON-LD structured data.
 * Apple Music pages may include MusicGroup, Person, or MusicArtist types.
 */
function extractAppleMusicJsonLd(
  html: string
): { name?: string; image?: string; sameAs?: string[] } | null {
  try {
    const jsonLdRegex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]) as
          | AppleMusicJsonLd
          | AppleMusicJsonLd[];

        // Handle array of JSON-LD objects
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Apple Music typically uses MusicGroup for artists
          if (
            item['@type'] === 'MusicGroup' ||
            item['@type'] === 'Person' ||
            item['@type'] === 'MusicArtist' ||
            item['@type'] === 'ProfilePage'
          ) {
            const image =
              typeof item.image === 'string' ? item.image : item.image?.url;

            // Normalize sameAs to array
            const sameAs = item.sameAs
              ? Array.isArray(item.sameAs)
                ? item.sameAs
                : [item.sameAs]
              : undefined;

            return {
              name: item.name,
              image,
              sameAs,
            };
          }
        }
      } catch {}
    }
  } catch {
    // Regex or parsing failed
  }

  return null;
}

/**
 * Extracts structured links from Apple Music HTML.
 * Tries to find links in JSON-LD sameAs property and other structured data.
 */
function extractAppleMusicStructuredLinks(html: string): StructuredLink[] {
  const structured: StructuredLink[] = [];
  const seen = new Set<string>();

  // Try to extract from JSON-LD sameAs property
  const jsonLdData = extractAppleMusicJsonLd(html);
  if (jsonLdData?.sameAs) {
    for (const url of jsonLdData.sameAs) {
      if (typeof url === 'string' && !seen.has(url)) {
        seen.add(url);
        structured.push({ url, title: undefined });
      }
    }
  }

  // Look for data attributes that might contain links
  const dataHrefRegex = /data-(?:href|url|link)=["'](https?:[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = dataHrefRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    if (!seen.has(rawUrl)) {
      seen.add(rawUrl);
      structured.push({ url: rawUrl, title: undefined });
    }
  }

  return structured;
}
