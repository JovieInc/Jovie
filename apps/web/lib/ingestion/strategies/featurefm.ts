/**
 * Feature.fm Smart Link Ingestion Strategy
 *
 * Extracts links and metadata from Feature.fm smart links (ffm.to).
 * Feature.fm is used by artists to create smart links for releases
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

const FEATUREFM_CONFIG: StrategyConfig = {
  platformId: 'featurefm',
  platformName: 'Feature.fm',
  canonicalHost: 'ffm.to',
  validHosts: new Set([
    'ffm.to',
    'www.ffm.to',
    'feature.fm',
    'www.feature.fm',
    'ffm.link',
    'www.ffm.link',
  ]),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal Feature.fm assets)
const SKIP_HOSTS = new Set([
  'ffm.to',
  'www.ffm.to',
  'feature.fm',
  'www.feature.fm',
  'ffm.link',
  'www.ffm.link',
  'assets.feature.fm',
  'cdn.feature.fm',
  'static.feature.fm',
  'images.feature.fm',
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Feature.fm smart link.
 */
export function isFeatureFmUrl(url: string): boolean {
  return validatePlatformUrl(url, FEATUREFM_CONFIG).valid;
}

/**
 * Validates and normalizes a Feature.fm URL.
 */
export function validateFeatureFmUrl(url: string): string | null {
  const result = validatePlatformUrl(url, FEATUREFM_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

/**
 * Extracts the link ID from a Feature.fm URL.
 */
export function extractFeatureFmId(url: string): string | null {
  const result = validatePlatformUrl(url, FEATUREFM_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

/**
 * Fetches a Feature.fm smart link page.
 */
export async function fetchFeatureFmDocument(
  sourceUrl: string,
  timeoutMs = FEATUREFM_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateFeatureFmUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Feature.fm URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: FEATUREFM_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Type for Feature.fm's embedded JSON data
 */
interface FeatureFmPageData {
  props?: {
    pageProps?: {
      smartlink?: {
        title?: string;
        artistName?: string;
        imageUrl?: string;
        coverUrl?: string;
        services?: Array<{
          url?: string;
          name?: string;
          serviceName?: string;
        }>;
        links?: Array<{
          url?: string;
          title?: string;
        }>;
      };
      release?: {
        title?: string;
        artistName?: string;
        artwork?: string;
        services?: Array<{
          url?: string;
          name?: string;
        }>;
      };
    };
  };
}

/**
 * Extracts streaming platform links and metadata from Feature.fm HTML.
 */
export function extractFeatureFm(html: string): ExtractionResult {
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
        sourcePlatform: 'featurefm',
        evidence: {
          sources: ['featurefm'],
          signals: ['featurefm_smart_link'],
        },
      });
    } catch {
      return;
    }
  };

  // Try to extract from Next.js/React data
  const nextData = extractScriptJson<FeatureFmPageData>(html, '__NEXT_DATA__');

  // Also try __FFM_DATA__ which Feature.fm sometimes uses
  const ffmData = extractScriptJson<FeatureFmPageData>(html, '__FFM_DATA__');
  const pageData = nextData ?? ffmData;

  // Extract from smartlink or release data
  const smartlink = pageData?.props?.pageProps?.smartlink;
  const release = pageData?.props?.pageProps?.release;

  if (smartlink?.services) {
    for (const service of smartlink.services) {
      addLink(service.url, service.name ?? service.serviceName);
    }
  }

  if (smartlink?.links) {
    for (const link of smartlink.links) {
      addLink(link.url, link.title);
    }
  }

  if (release?.services) {
    for (const service of release.services) {
      addLink(service.url, service.name);
    }
  }

  // Fallback: extract href attributes from HTML
  const hrefRegex = /href\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Also look for data attributes
  const dataUrlRegex =
    /data-(?:href|url|service-url)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  while ((match = dataUrlRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Extract display name (artist/release name)
  const displayName =
    smartlink?.artistName ??
    release?.artistName ??
    smartlink?.title ??
    release?.title ??
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Extract artwork as avatar
  const avatarUrl =
    smartlink?.imageUrl ??
    smartlink?.coverUrl ??
    release?.artwork ??
    extractMetaContent(html, 'og:image') ??
    null;

  return createExtractionResult(links, displayName, avatarUrl);
}

export { ExtractionError } from './base';
