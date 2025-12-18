/**
 * Linktree Profile Ingestion Strategy
 *
 * Extracts profile data and links from Linktree profiles.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  fetchDocument,
  normalizeHandle as baseNormalizeHandle,
  validatePlatformUrl,
  type FetchOptions,
  type StrategyConfig,
} from './base';

// ============================================================================
// Configuration
// ============================================================================

const LINKTREE_CONFIG: StrategyConfig = {
  platformId: 'linktree',
  platformName: 'Linktree',
  validHosts: new Set([
    'linktr.ee',
    'www.linktr.ee',
    'linktree.com',
    'www.linktree.com',
  ]),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal Linktree navigation)
const SKIP_HOSTS = new Set([
  'linktr.ee',
  'www.linktr.ee',
  'linktree.com',
  'www.linktree.com',
  'linktr.ee',
  // Also skip Linktree's CDN and asset domains
  'assets.production.linktr.ee',
  'ugc.production.linktr.ee',
]);

// Handle validation: 1-30 chars, alphanumeric + underscores
// Linktree is more restrictive than general handles
const LINKTREE_HANDLE_REGEX = /^[a-z0-9][a-z0-9_]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Linktree profile URL.
 */
export function isLinktreeUrl(url: string): boolean {
  try {
    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (originalParsed.protocol !== 'https:') {
      return false;
    }

    const parsed = new URL(normalizeUrl(url));

    if (!LINKTREE_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    const handle = extractLinktreeHandle(url);
    return handle !== null && handle.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a Linktree URL.
 * Returns null if invalid.
 */
export function validateLinktreeUrl(url: string): string | null {
  const result = validatePlatformUrl(url, LINKTREE_CONFIG);

  if (!result.valid || !result.handle) {
    return null;
  }

  // Additional Linktree-specific validation
  if (!isValidHandle(result.handle)) {
    return null;
  }

  // Return canonical URL format
  return `https://linktr.ee/${result.handle}`;
}

/**
 * Validates a Linktree handle format.
 * Linktree handles are more restrictive: alphanumeric + underscores only.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return LINKTREE_HANDLE_REGEX.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

/**
 * Extracts and normalizes the handle from a Linktree URL.
 */
export function extractLinktreeHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!LINKTREE_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
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
 * Fetches a Linktree profile document with proper error handling.
 *
 * @throws {ExtractionError} On fetch failure, timeout, or invalid response
 */
export async function fetchLinktreeDocument(
  sourceUrl: string,
  timeoutMs = LINKTREE_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateLinktreeUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError(
      'Invalid Linktree URL',
      'INVALID_URL'
    );
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://jov.ie)',
    headers: {
      // Linktree may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Extracts profile data and links from Linktree HTML.
 *
 * Handles multiple extraction methods:
 * 1. Open Graph / Twitter meta tags for display name and avatar
 * 2. href attributes for external links
 * 3. JSON-LD structured data (if present)
 */
export function extractLinktree(html: string): ExtractionResult {
  // Extract links
  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'linktree',
    sourceSignal: 'linktree_profile_link',
  });

  // Extract display name from meta tags
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " | Linktree" suffix if present)
  if (displayName) {
    displayName = displayName
      .replace(/\s*\|\s*Linktree$/i, '')
      .replace(/\s*-\s*Linktree$/i, '')
      .trim();
  }

  // Extract avatar from meta tags
  const avatarUrl =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  // Try to extract from JSON-LD if meta tags are missing
  if (!displayName || !avatarUrl) {
    const jsonLdData = extractJsonLd(html);
    if (jsonLdData) {
      if (!displayName && jsonLdData.name) {
        displayName = jsonLdData.name;
      }
      if (!avatarUrl && jsonLdData.image) {
        // avatarUrl is already set or we use jsonLdData.image
      }
    }
  }

  return createExtractionResult(links, displayName, avatarUrl);
}

// ============================================================================
// Internal Helpers
// ============================================================================

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
          if (item['@type'] === 'Person' || item['@type'] === 'ProfilePage') {
            const image =
              typeof item.image === 'string'
                ? item.image
                : item.image?.url;

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

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

export { ExtractionError } from './base';
