/**
 * Linkfire Smart Link Ingestion Strategy
 *
 * Extracts links and metadata from Linkfire smart links (lnk.to).
 * Linkfire is used by artists to create smart links for releases
 * that redirect to various streaming platforms.
 */

import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractMetaContent,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

// ============================================================================
// Configuration
// ============================================================================

const LINKFIRE_CONFIG: StrategyConfig = {
  platformId: 'linkfire',
  platformName: 'Linkfire',
  canonicalHost: 'lnk.to',
  validHosts: new Set([
    'lnk.to',
    'www.lnk.to',
    'linkfire.com',
    'www.linkfire.com',
    // Legacy/alternative domains
    'lnk.bio',
    'www.lnk.bio',
  ]),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal Linkfire assets)
const SKIP_HOSTS = new Set([
  'lnk.to',
  'www.lnk.to',
  'linkfire.com',
  'www.linkfire.com',
  'lnk.bio',
  'www.lnk.bio',
  'assets.linkfire.com',
  'cdn.linkfire.com',
  'linkfire-static.s3.amazonaws.com',
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Linkfire smart link.
 */
export function isLinkfireUrl(url: string): boolean {
  return validatePlatformUrl(url, LINKFIRE_CONFIG).valid;
}

/**
 * Validates and normalizes a Linkfire URL.
 */
export function validateLinkfireUrl(url: string): string | null {
  const result = validatePlatformUrl(url, LINKFIRE_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

/**
 * Extracts the link ID from a Linkfire URL.
 */
export function extractLinkfireId(url: string): string | null {
  const result = validatePlatformUrl(url, LINKFIRE_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

/**
 * Fetches a Linkfire smart link page.
 */
export async function fetchLinkfireDocument(
  sourceUrl: string,
  timeoutMs = LINKFIRE_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateLinkfireUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Linkfire URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: LINKFIRE_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Type for Linkfire's embedded JSON data
 */
interface LinkfirePageData {
  props?: {
    pageProps?: {
      board?: {
        title?: string;
        artistName?: string;
        imageUrl?: string;
        links?: Array<{
          url?: string;
          title?: string;
          serviceName?: string;
        }>;
      };
      release?: {
        title?: string;
        artistName?: string;
        artworkUrl?: string;
        links?: Array<{
          url?: string;
          name?: string;
        }>;
      };
    };
  };
}

/**
 * Extracts streaming platform links and metadata from Linkfire HTML.
 */
export function extractLinkfire(html: string): ExtractionResult {
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

      const detected = detectPlatform(normalizedUrl);
      if (!detected.isValid) return;

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
        sourcePlatform: 'linkfire',
        evidence: {
          sources: ['linkfire'],
          signals: ['linkfire_smart_link'],
        },
      });
    } catch {
      return;
    }
  };

  // Try to extract from Next.js __NEXT_DATA__
  const nextData = extractScriptJson<LinkfirePageData>(html, '__NEXT_DATA__');

  // Extract from board or release data
  const board = nextData?.props?.pageProps?.board;
  const release = nextData?.props?.pageProps?.release;

  if (board?.links) {
    for (const link of board.links) {
      addLink(link.url, link.title ?? link.serviceName);
    }
  }

  if (release?.links) {
    for (const link of release.links) {
      addLink(link.url, link.name);
    }
  }

  // Fallback: extract href attributes from HTML
  const hrefRegex = /href\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Also look for data-href or data-url attributes (common in smart links)
  const dataUrlRegex =
    /data-(?:href|url)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  while ((match = dataUrlRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Extract display name (artist/release name)
  const displayName =
    board?.artistName ??
    release?.artistName ??
    board?.title ??
    release?.title ??
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Extract artwork as avatar
  const avatarUrl =
    board?.imageUrl ??
    release?.artworkUrl ??
    extractMetaContent(html, 'og:image') ??
    null;

  return createExtractionResult(links, displayName, avatarUrl);
}

export { ExtractionError } from './base';
