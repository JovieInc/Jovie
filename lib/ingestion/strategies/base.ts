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

/**
 * Extracts JSON content from a script tag with a given id.
 */
export function extractScriptJson<T = unknown>(
  html: string,
  scriptId: string
): T | null {
  try {
    const pattern = new RegExp(
      `<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
      'i'
    );
    const match = pattern.exec(html);
    if (!match || match.length < 2) {
      return null;
    }
    const jsonText = match[1].trim();
    if (!jsonText) {
      return null;
    }
    return JSON.parse(jsonText) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON from script tag', {
      scriptId,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : String(error),
    });
    return null;
  }
}

export interface FetchOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Custom user agent string */
  userAgent?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** When set, only allow requests (including redirects) to these hostnames */
  allowedHosts?: Set<string>;
  /** Maximum response size in bytes (default: 2_000_000) */
  maxResponseBytes?: number;
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
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

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
    allowedHosts,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = options;

  const normalizedUrl = normalizeUrl(url);
  let lastError: Error | null = null;

  const normalizeAndValidate = (candidateUrl: string): string => {
    const parsed = new URL(candidateUrl);
    if (parsed.protocol !== 'https:') {
      throw new ExtractionError('Invalid URL', 'INVALID_URL');
    }
    if (allowedHosts && !allowedHosts.has(parsed.hostname.toLowerCase())) {
      throw new ExtractionError('Invalid host', 'INVALID_HOST');
    }
    return parsed.toString();
  };

  const initialUrl = normalizeAndValidate(normalizedUrl);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let currentUrl = initialUrl;
      let redirects = 0;
      // In allowlist mode, block cross-host redirects by validating each hop before requesting.
      // In non-allowlist mode, preserve existing fetch behavior.
      while (true) {
        const response = await fetch(currentUrl, {
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
          redirect: allowedHosts ? 'manual' : 'follow',
        });

        if (allowedHosts) {
          const finalHost = new URL(response.url).hostname.toLowerCase();
          if (!allowedHosts.has(finalHost)) {
            throw new ExtractionError('Invalid host', 'INVALID_HOST');
          }

          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.get('location')
          ) {
            if (redirects >= MAX_REDIRECTS) {
              throw new ExtractionError('Too many redirects', 'FETCH_FAILED');
            }
            const location = response.headers.get('location');
            if (!location) {
              throw new ExtractionError('Invalid redirect', 'FETCH_FAILED');
            }
            const nextUrl = normalizeAndValidate(
              new URL(location, currentUrl).toString()
            );
            currentUrl = nextUrl;
            redirects += 1;
            continue;
          }
        }

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
            url: currentUrl,
            contentType,
          });
        }

        const html = await readResponseTextWithLimit(
          response,
          maxResponseBytes
        );

        if (!html || html.trim().length === 0) {
          throw new ExtractionError(
            'Empty response from server',
            'EMPTY_RESPONSE'
          );
        }

        // Basic HTML validation - should contain at least some HTML-like content
        if (!html.includes('<') && !html.includes('>')) {
          logger.warn('Response does not appear to be HTML', {
            url: currentUrl,
            contentLength: html.length,
          });
        }

        return {
          html,
          statusCode: response.status,
          finalUrl: response.url,
          contentType,
        };
      }
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
          url: initialUrl,
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

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;

  if (typeof contentLength === 'number' && Number.isFinite(contentLength)) {
    if (contentLength > maxBytes) {
      throw new ExtractionError('Response too large', 'FETCH_FAILED');
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new ExtractionError('Response too large', 'FETCH_FAILED');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        throw new ExtractionError('Response too large', 'FETCH_FAILED');
      }
      out += decoder.decode(value, { stream: true });
    }
  }

  out += decoder.decode();
  return out;
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

const UNSUPPORTED_SCHEMES = /^(javascript|data|vbscript|file|ftp):/i;

function isValidHref(href: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (UNSUPPORTED_SCHEMES.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  if (!trimmed.toLowerCase().startsWith('https://')) return false;
  try {
    // Throws on invalid URLs
    // normalizeUrl is heavier; basic URL parse is enough for validation here.

    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
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
    const href = match[1]?.trim();
    if (href && isValidHref(href)) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

/**
 * Removes common tracking parameters from a URL (utm_*, fbclid, gclid, etc.).
 */
export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    for (const key of Array.from(params.keys())) {
      if (TRACKING_PARAMS.has(key)) {
        params.delete(key);
      }
    }
    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extracts normalized, deduped links from HTML content.
 */
export interface LinkExtractionOptions {
  skipHosts: Set<string>;
  sourcePlatform: string;
  sourceSignal: string;
}

// Hosts that are primarily tracking/shorteners and should be skipped.
const TRACKING_HOSTS = new Set<string>(['bit.ly', 't.co', 'lnkd.in', 'rb.gy']);

/**
 * Extracts normalized, deduped links from HTML content with platform metadata.
 */
export function extractLinks(
  html: string,
  options: LinkExtractionOptions
): ExtractedLink[] {
  const hrefs = extractHrefs(html);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  for (const href of hrefs) {
    try {
      const normalizedUrl = normalizeUrl(href);
      const host = new URL(normalizedUrl).hostname.toLowerCase();
      if (options.skipHosts.has(host)) continue;
      if (TRACKING_HOSTS.has(host)) continue;

      const detected = detectPlatform(normalizedUrl);
      if (!detected.isValid) continue;

      const cleanedUrl = stripTrackingParams(detected.normalizedUrl);
      const key = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: cleanedUrl,
      });
      if (seen.has(key)) continue;
      seen.add(key);

      links.push({
        url: cleanedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle,
        sourcePlatform: options.sourcePlatform,
        evidence: {
          sources: [options.sourcePlatform],
          signals: [options.sourceSignal],
        },
      });
    } catch {
      continue;
    }
  }

  return links;
}

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
    const candidate = url.trim();

    // Reject dangerous or unsupported schemes early
    if (/^(javascript|data|vbscript|file|ftp):/i.test(candidate)) {
      return { valid: false, normalized: null, handle: null };
    }

    // Reject protocol-relative URLs to avoid inheriting caller context
    if (candidate.startsWith('//')) {
      return { valid: false, normalized: null, handle: null };
    }

    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    if (originalParsed.protocol !== 'https:') {
      return { valid: false, normalized: null, handle: null };
    }

    const normalized = normalizeUrl(candidate);
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
 * Note: &amp; must be decoded LAST to avoid double-unescaping
 * (e.g., "&amp;lt;" should become "&lt;", not "<")
 */
export function decodeHtmlEntities(str: string): string {
  // Decode once; if already decoded, return as-is
  if (!str.includes('&')) {
    return str;
  }

  // Decode specific entities first, then ampersand last
  return str
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'); // Must be last to avoid double-unescaping
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
    displayName,
    avatarUrl,
  };
}
