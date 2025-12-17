/**
 * Beacons.ai Profile Ingestion Strategy
 *
 * Extracts profile data and links from Beacons.ai profiles.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  normalizeHandle as baseNormalizeHandle,
  createExtractionResult,
  decodeHtmlEntities,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

// ============================================================================
// Configuration
// ============================================================================

const BEACONS_CONFIG: StrategyConfig = {
  platformId: 'beacons',
  platformName: 'Beacons',
  canonicalHost: 'beacons.ai',
  validHosts: new Set([
    'beacons.ai',
    'www.beacons.ai',
    'beacons.page', // Alternative domain
    'www.beacons.page',
  ]),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal Beacons navigation)
const SKIP_HOSTS = new Set([
  'beacons.ai',
  'www.beacons.ai',
  'beacons.page',
  'www.beacons.page',
  // Beacons CDN and asset domains
  'cdn.beacons.ai',
  'assets.beacons.ai',
  'images.beacons.ai',
  'static.beacons.ai',
  // Common internal paths that might appear as links
  'app.beacons.ai',
  'dashboard.beacons.ai',
]);

// Handle validation: 1-30 chars, alphanumeric + underscores + dots
// Beacons allows slightly more flexible handles than Linktree
const BEACONS_HANDLE_REGEX =
  /^[a-z0-9][a-z0-9_.]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Beacons.ai profile URL.
 */
export function isBeaconsUrl(url: string): boolean {
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

    const parsed = new URL(normalizeUrl(candidate));

    if (!BEACONS_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    const handle = extractBeaconsHandle(url);
    return handle !== null && handle.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a Beacons.ai URL.
 * Returns null if invalid.
 */
export function validateBeaconsUrl(url: string): string | null {
  const result = validatePlatformUrl(url, BEACONS_CONFIG);

  if (!result.valid || !result.handle) {
    return null;
  }

  // Additional Beacons-specific validation
  if (!isValidHandle(result.handle)) {
    return null;
  }

  // Return canonical URL format
  return `https://${BEACONS_CONFIG.canonicalHost}/${result.handle}`;
}

/**
 * Validates a Beacons handle format.
 * Beacons handles allow alphanumeric, underscores, and dots.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }

  // Skip reserved paths
  const reserved = new Set([
    'login',
    'signup',
    'register',
    'dashboard',
    'settings',
    'admin',
    'api',
    'app',
    'help',
    'support',
    'about',
    'pricing',
    'features',
    'blog',
    'terms',
    'privacy',
    'contact',
    'faq',
    'creators',
    'explore',
    'search',
  ]);

  const normalized = handle.toLowerCase();

  if (reserved.has(normalized)) {
    return false;
  }

  return BEACONS_HANDLE_REGEX.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

/**
 * Extracts and normalizes the handle from a Beacons.ai URL.
 */
export function extractBeaconsHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!BEACONS_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    // Normalize: lowercase, strip @ prefix
    const rawHandle = parts[0].replace(/^@/, '').toLowerCase();

    // Validate handle format
    if (!isValidHandle(rawHandle)) {
      return null;
    }

    return rawHandle;
  } catch {
    return null;
  }
}

/**
 * Fetches a Beacons.ai profile document with proper error handling.
 *
 * @throws {ExtractionError} On fetch failure, timeout, or invalid response
 */
export async function fetchBeaconsDocument(
  sourceUrl: string,
  timeoutMs = BEACONS_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateBeaconsUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Beacons.ai URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://jov.ie)',
    headers: {
      // Beacons may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: BEACONS_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Extracts profile data and links from Beacons.ai HTML.
 *
 * Handles multiple extraction methods:
 * 1. Open Graph / Twitter meta tags for display name and avatar
 * 2. href attributes for external links
 * 3. JSON-LD structured data (if present)
 * 4. Beacons-specific data attributes
 */
export function extractBeacons(html: string): ExtractionResult {
  // Extract links
  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'beacons',
    sourceSignal: 'beacons_profile_link',
  });

  // Extract display name from meta tags
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " | Beacons" or similar suffixes)
  if (displayName) {
    displayName = cleanBeaconsDisplayName(displayName);
  }

  // Extract avatar from meta tags
  let avatarUrl =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  // Beacons sometimes uses a default OG image, try to detect and skip it
  if (avatarUrl && isDefaultBeaconsImage(avatarUrl)) {
    avatarUrl = null;
  }

  // Try to extract from JSON-LD if meta tags are missing
  if (!displayName || !avatarUrl) {
    const jsonLdData = extractJsonLd(html);
    if (jsonLdData) {
      if (!displayName && jsonLdData.name) {
        displayName = jsonLdData.name;
      }
      if (
        !avatarUrl &&
        jsonLdData.image &&
        !isDefaultBeaconsImage(jsonLdData.image)
      ) {
        avatarUrl = jsonLdData.image;
      }
    }
  }

  // Try Beacons-specific extraction methods
  if (!displayName || !avatarUrl) {
    const beaconsData = extractBeaconsSpecificData(html);
    if (!displayName && beaconsData.displayName) {
      displayName = beaconsData.displayName;
    }
    if (!avatarUrl && beaconsData.avatarUrl) {
      avatarUrl = beaconsData.avatarUrl;
    }
  }

  return createExtractionResult(links, displayName, avatarUrl);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Cleans up Beacons display name by removing platform suffixes.
 */
function cleanBeaconsDisplayName(name: string): string {
  return (
    name
      // Handle " | Beacons" and variations
      .replace(/\s*\|\s*Beacons(?:\.ai)?$/i, '')
      // Handle " - Beacons.ai" and variations
      .replace(/\s*-\s*Beacons(?:\.ai)?$/i, '')
      // Handle "on Beacons.ai" and variations
      .replace(/\s+on\s+Beacons(?:\.ai)?$/i, '')
      // Handle "'s Beacons.ai" and variations
      .replace(/['']s\s+Beacons(?:\.ai)?$/i, '')
      // Handle just "Beacons" at the end
      .replace(/\s+Beacons(?:\.ai)?$/i, '')
      .trim()
  );
}

/**
 * Checks if an image URL is a default Beacons placeholder image.
 */
function isDefaultBeaconsImage(url: string): boolean {
  const defaultPatterns = [
    /default[-_]?avatar/i,
    /placeholder/i,
    /beacons[-_]?logo/i,
    /og[-_]?default/i,
    /share[-_]?default/i,
  ];

  return defaultPatterns.some(pattern => pattern.test(url));
}

interface JsonLdPerson {
  '@type'?: string;
  name?: string;
  image?: string | { url?: string };
  url?: string;
}

/**
 * Attempts to extract data from JSON-LD structured data.
 */
function extractJsonLd(html: string): { name?: string; image?: string } | null {
  try {
    // Find JSON-LD script tags
    const jsonLdRegex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]) as JsonLdPerson | JsonLdPerson[];

        // Handle array of JSON-LD objects
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (
            item['@type'] === 'Person' ||
            item['@type'] === 'ProfilePage' ||
            item['@type'] === 'WebPage'
          ) {
            const image =
              typeof item.image === 'string' ? item.image : item.image?.url;

            return {
              name: item.name,
              image,
            };
          }
        }
      } catch {
        // Invalid JSON, continue to next match
        continue;
      }
    }
  } catch {
    // Regex or parsing failed
  }

  return null;
}

/**
 * Extracts data from Beacons-specific HTML patterns.
 * Beacons uses React/Next.js and may have data in various formats.
 */
function extractBeaconsSpecificData(html: string): {
  displayName?: string;
  avatarUrl?: string;
} {
  const result: { displayName?: string; avatarUrl?: string } = {};

  // Try to find display name in common Beacons patterns
  // Pattern 1: h1 or h2 with profile name
  const namePatterns = [
    /<h1[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<div[^>]*class="[^"]*profile[-_]?name[^"]*"[^>]*>([^<]+)<\/div>/i,
    /<span[^>]*class="[^"]*display[-_]?name[^"]*"[^>]*>([^<]+)<\/span>/i,
  ];

  for (const pattern of namePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const name = decodeHtmlEntities(match[1].trim());
      if (name && name.length > 0 && name.length < 100) {
        result.displayName = name;
        break;
      }
    }
  }

  // Try to find avatar in common Beacons patterns
  // Pattern 1: img with profile/avatar class
  const avatarPatterns = [
    /<img[^>]*class="[^"]*(?:avatar|profile[-_]?(?:image|pic|photo))[^"]*"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]+)"[^>]*class="[^"]*(?:avatar|profile[-_]?(?:image|pic|photo))[^"]*"/i,
    // Next.js Image component pattern
    /<img[^>]*alt="[^"]*(?:profile|avatar)[^"]*"[^>]*src="([^"]+)"/i,
  ];

  for (const pattern of avatarPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const url = match[1];
      if (url && !isDefaultBeaconsImage(url)) {
        result.avatarUrl = url;
        break;
      }
    }
  }

  return result;
}

// ============================================================================
// Re-exports
// ============================================================================

export { ExtractionError } from './base';
