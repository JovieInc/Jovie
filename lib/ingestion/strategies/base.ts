/**
 * Base extraction utilities shared across all ingestion strategies.
 * Provides common fetch, parsing, and error handling patterns.
 */

import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractedLink, ExtractionResult } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FetchOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Custom user agent string */
  userAgent?: string;
  /** Additional headers */
  headers?: Record<string, string>;
}

export interface FetchResult {
  html: string;
  statusCode: number;
  finalUrl: string;
  contentType: string | null;
}

export interface StrategyConfig {
  /** Platform identifier (e.g., 'linktree', 'beacons') */
  platformId: string;
  /** Display name for logging */
  platformName: string;
  /** Valid hostnames for this platform */
  validHosts: Set<string>;
  /** Default fetch timeout */
  defaultTimeoutMs: number;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: ExtractionErrorCode,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export type ExtractionErrorCode =
  | 'INVALID_URL'
  | 'INVALID_HOST'
  | 'INVALID_HANDLE'
  | 'FETCH_FAILED'
  | 'FETCH_TIMEOUT'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'PARSE_ERROR'
  | 'EMPTY_RESPONSE';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const DEFAULT_USER_AGENT = 'jovie-link-ingestion/1.0 (+https://jov.ie)';

// Common href extraction regex - matches href="..." with various quote styles
const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;

// Common tracking parameters to strip
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
  '_ga',
  'ref',
  'source',
  'si', // Spotify tracking
  'nd', // Various tracking
]);

// ============================================================================
// Fetch Utilities
// ============================================================================

/**
 * Fetches a document with timeout, retries, and proper error handling.
 * Designed for server-side use with AbortController.
 */
export async function fetchDocument(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    userAgent = DEFAULT_USER_AGENT,
    headers = {},
  } = options;

  const normalizedUrl = normalizeUrl(url);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
          ...headers,
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      // Handle specific HTTP status codes
      if (response.status === 404) {
        throw new ExtractionError('Profile not found', 'NOT_FOUND', 404);
      }

      if (response.status === 429) {
        throw new ExtractionError(
          'Rate limited by platform',
          'RATE_LIMITED',
          429
        );
      }

      if (!response.ok) {
        throw new ExtractionError(
          `HTTP ${response.status}: ${response.statusText}`,
          'FETCH_FAILED',
          response.status
        );
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Warn if response is not HTML (but don't fail - some platforms serve different content types)
      if (
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml')
      ) {
        logger.warn('Non-HTML content type received', {
          url: normalizedUrl,
          contentType,
        });
      }

      const html = await response.text();

      if (!html || html.trim().length === 0) {
        throw new ExtractionError(
          'Empty response from server',
          'EMPTY_RESPONSE'
        );
      }

      // Basic HTML validation - should contain at least some HTML-like content
      if (!html.includes('<') && !html.includes('>')) {
        logger.warn('Response does not appear to be HTML', {
          url: normalizedUrl,
          contentLength: html.length,
        });
      }

      return {
        html,
        statusCode: response.status,
        finalUrl: response.url,
        contentType,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Don't retry on certain errors
      if (error instanceof ExtractionError) {
        if (['NOT_FOUND', 'RATE_LIMITED', 'INVALID_URL'].includes(error.code)) {
          throw error;
        }
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ExtractionError(
          `Request timed out after ${timeoutMs}ms`,
          'FETCH_TIMEOUT',
          undefined,
          error
        );
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Log retry attempt
      if (attempt < maxRetries) {
        logger.warn('Fetch attempt failed, retrying', {
          url: normalizedUrl,
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  // All retries exhausted
  throw lastError instanceof ExtractionError
    ? lastError
    : new ExtractionError(
        lastError?.message || 'Fetch failed after retries',
        'FETCH_FAILED',
        undefined,
        lastError
      );
}

// ============================================================================
// HTML Parsing Utilities
// ============================================================================

/**
 * Extracts meta tag content by property or name attribute.
 * Handles various meta tag formats.
 */
export function extractMetaContent(
  html: string,
  property: string
): string | null {
  // Try property attribute first (Open Graph style)
  const propertyRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const propertyMatch = html.match(propertyRegex);
  if (propertyMatch?.[1]) {
    return decodeHtmlEntities(propertyMatch[1].trim());
  }

  // Try content before property (alternate format)
  const altRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRegex(property)}["']`,
    'i'
  );
  const altMatch = html.match(altRegex);
  if (altMatch?.[1]) {
    return decodeHtmlEntities(altMatch[1].trim());
  }

  return null;
}

/**
 * Extracts all href values from HTML, filtering out invalid ones.
 */
export function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  HREF_REGEX.lastIndex = 0;

  while ((match = HREF_REGEX.exec(html)) !== null) {
    const href = match[1];
    if (href && isValidHref(href)) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

/**
 * Checks if an href is valid for extraction.
 */
function isValidHref(href: string): boolean {
  // Skip empty, anchors, javascript, mailto, tel
  if (!href || href.startsWith('#')) return false;
  if (href.startsWith('javascript:')) return false;
  if (href.startsWith('mailto:')) return false;
  if (href.startsWith('tel:')) return false;
  if (href.startsWith('data:')) return false;

  // Must be http(s) or protocol-relative
  if (!/^(https?:\/\/|\/\/)/i.test(href)) return false;

  return true;
}

/**
 * Extracts and normalizes links from HTML, filtering by platform hosts to skip.
 */
export function extractLinks(
  html: string,
  options: {
    skipHosts: Set<string>;
    sourcePlatform: string;
    sourceSignal: string;
  }
): ExtractedLink[] {
  const { skipHosts, sourcePlatform, sourceSignal } = options;
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  const hrefs = extractHrefs(html);

  for (const rawHref of hrefs) {
    try {
      const normalizedHref = normalizeUrl(rawHref);
      const parsed = new URL(normalizedHref);

      // Skip internal platform links
      if (skipHosts.has(parsed.hostname.toLowerCase())) {
        continue;
      }

      // Skip tracking/redirect URLs
      if (isTrackingUrl(parsed)) {
        continue;
      }

      const detected = detectPlatform(normalizedHref);
      if (!detected.isValid) continue;

      // Dedupe by canonical identity (handles www vs non-www, trailing slashes, etc.)
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
        sourcePlatform,
        evidence: {
          sources: [sourcePlatform],
          signals: [sourceSignal],
        },
      });
    } catch {
      // Skip unparseable URLs
      continue;
    }
  }

  return links;
}

/**
 * Checks if a URL is primarily a tracking/redirect URL.
 */
function isTrackingUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();

  // Common URL shorteners and trackers
  const trackers = [
    'bit.ly',
    't.co',
    'goo.gl',
    'ow.ly',
    'tinyurl.com',
    'buff.ly',
    'lnkd.in',
    'fb.me',
    'click.linksynergy.com',
    'redirect.viglink.com',
  ];

  return trackers.some(tracker => host.includes(tracker));
}

/**
 * Strips tracking parameters from a URL.
 */
export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// ============================================================================
// Handle Validation
// ============================================================================

/**
 * Validates a handle format (alphanumeric, underscores, dots, 1-30 chars).
 * More permissive than strict Linktree validation to support various platforms.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }

  // Allow alphanumeric, underscores, dots, hyphens
  // Must start and end with alphanumeric
  const normalized = handle.toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,28}[a-z0-9]$|^[a-z0-9]$/.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '');
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validates that a URL belongs to a specific platform.
 */
export function validatePlatformUrl(
  url: string,
  config: StrategyConfig
): { valid: boolean; normalized: string | null; handle: string | null } {
  try {
    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(
      url.startsWith('http') ? url : `https://${url}`
    );
    if (originalParsed.protocol !== 'https:') {
      return { valid: false, normalized: null, handle: null };
    }

    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    // Must be HTTPS (after normalization, should always be true if original was https)
    if (parsed.protocol !== 'https:') {
      return { valid: false, normalized: null, handle: null };
    }

    // Must be a valid host
    if (!config.validHosts.has(parsed.hostname.toLowerCase())) {
      return { valid: false, normalized: null, handle: null };
    }

    // Extract handle from path
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return { valid: false, normalized: null, handle: null };
    }

    const rawHandle = parts[0].replace(/^@/, '').toLowerCase();
    if (!isValidHandle(rawHandle)) {
      return { valid: false, normalized: null, handle: null };
    }

    return {
      valid: true,
      normalized: `https://${Array.from(config.validHosts)[0]}/${rawHandle}`,
      handle: rawHandle,
    };
  } catch {
    return { valid: false, normalized: null, handle: null };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decodes common HTML entities.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Creates a standard extraction result.
 */
export function createExtractionResult(
  links: ExtractedLink[],
  displayName: string | null,
  avatarUrl: string | null
): ExtractionResult {
  return {
    links,
    displayName: displayName?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
  };
}
