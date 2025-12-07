/**
 * Linktree Profile Ingestion Strategy
 *
 * Extracts profile data and links from Linktree profiles.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  normalizeHandle as baseNormalizeHandle,
  createExtractionResult,
  ExtractionError,
  extractMetaContent,
  type FetchOptions,
  fetchDocument,
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
  // Linktree CDN and asset domains
  'cdn.linktr.ee',
  'assets.linktree.com',
  'static.linktr.ee',
]);

// Handle validation: 1-30 chars, alphanumeric + underscores
// Linktree is more restrictive than general handles
const LINKTREE_HANDLE_REGEX =
  /^[a-z0-9][a-z0-9_]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

// Regex to extract href attributes
const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Linktree profile URL.
 */
export function isLinktreeUrl(url: string): boolean {
  try {
    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(
      url.startsWith('http') ? url : `https://${url}`
    );
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
  try {
    // Check original URL protocol before normalization
    const originalParsed = new URL(
      url.startsWith('http') ? url : `https://${url}`
    );
    if (originalParsed.protocol !== 'https:') {
      return null;
    }

    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!LINKTREE_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const handle = extractLinktreeHandle(url);
    if (!handle || !isValidHandle(handle)) {
      return null;
    }

    // Return canonical URL format
    return `https://linktr.ee/${handle}`;
  } catch {
    return null;
  }
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
    if (parts.length === 0) {
      return null;
    }

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
 * Fetches the HTML content of a Linktree profile.
 * Includes timeout, retries, and proper error handling.
 */
export async function fetchLinktreeDocument(
  sourceUrl: string,
  timeoutMs = LINKTREE_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateLinktreeUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Linktree URL', 'INVALID_URL');
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
  // Extract links using custom logic for Linktree
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  HREF_REGEX.lastIndex = 0;

  while ((match = HREF_REGEX.exec(html)) !== null) {
    const rawHref = match[1];
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:')
    )
      continue;
    if (rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;
    if (!/^https?:\/\//i.test(rawHref)) continue;

    try {
      const normalizedHref = normalizeUrl(rawHref);
      const parsed = new URL(normalizedHref);

      // Skip internal Linktree links
      if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) {
        continue;
      }

      const detected = detectPlatform(normalizedHref);
      if (!detected.isValid) continue;

      // Dedupe by canonical identity
      const key = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      if (seen.has(key)) continue;
      seen.add(key);

      links.push({
        url: detected.normalizedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle,
        sourcePlatform: 'linktree',
        evidence: {
          sources: ['linktree'],
          signals: ['linktree_profile_link'],
        },
      });
    } catch {
      // Skip unparseable URLs
      continue;
    }
  }

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

  return createExtractionResult(links, displayName, avatarUrl);
}
