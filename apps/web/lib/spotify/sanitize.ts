/**
 * Spotify Data Sanitization Utilities
 *
 * Provides sanitization for all data received from the Spotify API
 * before storage or display to prevent XSS and other injection attacks.
 *
 * Security considerations:
 * - All text is stripped of HTML tags using DOMPurify
 * - URLs are validated against allowlists for Spotify CDN domains
 * - External URLs are restricted to official Spotify domains
 * - Numeric values are clamped to valid ranges
 */

import DOMPurify from 'isomorphic-dompurify';
import { captureWarning } from '@/lib/error-tracking';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw Spotify artist data from API
 */
export interface RawSpotifyArtist {
  id: string;
  name: string;
  bio?: string;
  images?: Array<{ url: string; height?: number; width?: number }>;
  genres?: string[];
  followers?: { total: number };
  popularity?: number;
  external_urls?: Record<string, string>;
}

/**
 * Sanitized artist data safe for storage/display
 */
export interface SanitizedArtist {
  spotifyId: string;
  name: string;
  bio: string | null;
  imageUrl: string | null;
  genres: string[];
  followerCount: number;
  popularity: number;
  externalUrls: Record<string, string>;
}

// ============================================================================
// Allowed Domains
// ============================================================================

/**
 * Allowed hostnames for Spotify CDN images
 * These are the official Spotify image CDN domains
 */
const ALLOWED_IMAGE_HOSTS = new Set([
  'i.scdn.co',
  'mosaic.scdn.co',
  'daily-mix.scdn.co',
  'seeded-session-images.scdn.co',
  'wrapped-images.spotifycdn.com',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
  'thisis-images.spotifycdn.com',
  'charts-images.scdn.co',
  'lineup-images.scdn.co',
]);

/**
 * Allowed external URL domains
 */
const ALLOWED_EXTERNAL_DOMAINS: Record<string, string[]> = {
  spotify: ['open.spotify.com'],
};

// ============================================================================
// Text Sanitization
// ============================================================================

/**
 * Sanitize text content by removing all HTML tags and trimming to max length.
 *
 * @param text - Raw text to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized text string
 */
export function sanitizeText(text: string, maxLength: number): string {
  // Remove all HTML tags - DOMPurify with ALLOWED_TAGS: [] strips everything
  const sanitized = DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });

  // Trim and limit length
  return sanitized.slice(0, maxLength).trim();
}

/**
 * Sanitize a display name for artist/profile.
 * Limited to 200 characters.
 *
 * @param name - Raw name to sanitize
 * @returns Sanitized name string
 */
export function sanitizeName(name: string): string {
  return sanitizeText(name, 200);
}

/**
 * Sanitize a bio/description field.
 * Limited to 2000 characters.
 *
 * @param bio - Raw bio to sanitize
 * @returns Sanitized bio string or null if empty
 */
export function sanitizeBio(bio: string | undefined | null): string | null {
  if (!bio) return null;
  const sanitized = sanitizeText(bio, 2000);
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Sanitize a genre string.
 * Limited to 50 characters.
 *
 * @param genre - Raw genre to sanitize
 * @returns Sanitized genre string
 */
export function sanitizeGenre(genre: string): string {
  return sanitizeText(genre, 50);
}

// ============================================================================
// URL Sanitization
// ============================================================================

/**
 * Sanitize an image URL from Spotify.
 *
 * Security:
 * - Only allows images from known Spotify CDN domains
 * - Forces HTTPS protocol
 * - Logs and blocks non-Spotify URLs
 *
 * @param url - Raw image URL
 * @returns Sanitized HTTPS URL or null if invalid
 */
export function sanitizeImageUrl(
  url: string | undefined | null
): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Only allow Spotify CDN domains
    if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
      captureWarning('[Spotify Sanitize] Blocked non-Spotify image URL', {
        url,
        hostname: parsed.hostname,
      });
      return null;
    }

    // Force HTTPS
    parsed.protocol = 'https:';

    return parsed.toString();
  } catch {
    captureWarning('[Spotify Sanitize] Invalid image URL format', { url });
    return null;
  }
}

/**
 * Sanitize external URLs from Spotify API response.
 *
 * Security:
 * - Only keeps known URL types (currently just 'spotify')
 * - Validates domain matches expected domain for URL type
 * - Forces HTTPS protocol
 *
 * @param urls - Raw external URLs object
 * @returns Sanitized external URLs object with only valid entries
 */
export function sanitizeExternalUrls(
  urls: Record<string, string> | undefined | null
): Record<string, string> {
  if (!urls) return {};

  const sanitized: Record<string, string> = {};

  for (const [key, allowedDomains] of Object.entries(
    ALLOWED_EXTERNAL_DOMAINS
  )) {
    const url = urls[key];
    if (!url) continue;

    try {
      const parsed = new URL(url);

      // Verify domain is in allowed list for this URL type
      if (!allowedDomains.includes(parsed.hostname)) {
        captureWarning(
          '[Spotify Sanitize] Blocked external URL with invalid domain',
          {
            key,
            url,
            hostname: parsed.hostname,
            allowed: allowedDomains,
          }
        );
        continue;
      }

      // Force HTTPS
      parsed.protocol = 'https:';

      sanitized[key] = parsed.toString();
    } catch {
      captureWarning('[Spotify Sanitize] Invalid external URL format', {
        key,
        url,
      });
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize a Spotify open URL.
 *
 * @param url - Raw Spotify URL
 * @returns Sanitized HTTPS URL or null if invalid
 */
export function sanitizeSpotifyUrl(
  url: string | undefined | null
): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Must be open.spotify.com
    if (parsed.hostname !== 'open.spotify.com') {
      captureWarning('[Spotify Sanitize] Blocked non-Spotify URL', {
        url,
        hostname: parsed.hostname,
      });
      return null;
    }

    // Force HTTPS
    parsed.protocol = 'https:';

    return parsed.toString();
  } catch {
    captureWarning('[Spotify Sanitize] Invalid Spotify URL format', { url });
    return null;
  }
}

// ============================================================================
// Numeric Sanitization
// ============================================================================

/**
 * Sanitize a follower count.
 * Ensures non-negative integer.
 *
 * @param count - Raw follower count
 * @returns Sanitized non-negative integer
 */
export function sanitizeFollowerCount(
  count: number | undefined | null
): number {
  if (count === undefined || count === null || Number.isNaN(count)) {
    return 0;
  }
  return Math.max(0, Math.floor(count));
}

/**
 * Sanitize a popularity score.
 * Clamped to 0-100 range.
 *
 * @param popularity - Raw popularity score
 * @returns Sanitized popularity between 0-100
 */
export function sanitizePopularity(
  popularity: number | undefined | null
): number {
  if (
    popularity === undefined ||
    popularity === null ||
    Number.isNaN(popularity)
  ) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.floor(popularity)));
}

// ============================================================================
// Artist Data Sanitization
// ============================================================================

/**
 * Sanitize complete artist data from Spotify API.
 *
 * This is the main entry point for sanitizing Spotify artist data.
 * All fields are sanitized according to their type.
 *
 * @param raw - Raw artist data from Spotify API
 * @returns Fully sanitized artist data safe for storage/display
 */
export function sanitizeArtistData(raw: RawSpotifyArtist): SanitizedArtist {
  // Get the best image (largest by height)
  let bestImage: string | null = null;
  if (raw.images && raw.images.length > 0) {
    const sorted = [...raw.images].sort(
      (a, b) => (b.height || 0) - (a.height || 0)
    );
    bestImage = sanitizeImageUrl(sorted[0]?.url);
  }

  return {
    spotifyId: raw.id, // Already validated via schema before reaching here
    name: sanitizeName(raw.name),
    bio: sanitizeBio(raw.bio),
    imageUrl: bestImage,
    genres: (raw.genres ?? []).slice(0, 10).map(sanitizeGenre),
    followerCount: sanitizeFollowerCount(raw.followers?.total),
    popularity: sanitizePopularity(raw.popularity),
    externalUrls: sanitizeExternalUrls(raw.external_urls),
  };
}

/**
 * Sanitize search result data from Spotify.
 * Used for search results which have less data than full artist profiles.
 *
 * @param raw - Raw search result artist
 * @returns Sanitized search result
 */
export function sanitizeSearchResult(raw: RawSpotifyArtist): {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  followerCount: number;
  popularity: number;
} {
  // Get the best image
  let bestImage: string | null = null;
  if (raw.images && raw.images.length > 0) {
    const sorted = [...raw.images].sort(
      (a, b) => (b.height || 0) - (a.height || 0)
    );
    bestImage = sanitizeImageUrl(sorted[0]?.url);
  }

  return {
    spotifyId: raw.id,
    name: sanitizeName(raw.name),
    imageUrl: bestImage,
    followerCount: sanitizeFollowerCount(raw.followers?.total),
    popularity: sanitizePopularity(raw.popularity),
  };
}

// ============================================================================
// Exports for specific use cases
// ============================================================================

export { ALLOWED_IMAGE_HOSTS, ALLOWED_EXTERNAL_DOMAINS };
