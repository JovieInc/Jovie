/**
 * ToneDen Smart Link Ingestion Strategy
 *
 * Extracts links and metadata from ToneDen smart links and fan gates.
 * ToneDen is used by artists to create smart links for releases
 * and fan unlock pages that redirect to various streaming platforms.
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

const TONEDEN_CONFIG: StrategyConfig = {
  platformId: 'toneden',
  platformName: 'ToneDen',
  canonicalHost: 'toneden.io',
  validHosts: new Set([
    'toneden.io',
    'www.toneden.io',
    // ToneDen custom domains are common
    'gate.toneden.io',
    'fanlink.toneden.io',
  ]),
  defaultTimeoutMs: 10000,
};

// Hosts to skip when extracting links (internal ToneDen assets)
const SKIP_HOSTS = new Set([
  'toneden.io',
  'www.toneden.io',
  'gate.toneden.io',
  'fanlink.toneden.io',
  'assets.toneden.io',
  'cdn.toneden.io',
  'static.toneden.io',
  'images.toneden.io',
  's3.amazonaws.com',
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid ToneDen smart link.
 */
export function isToneDenUrl(url: string): boolean {
  return validatePlatformUrl(url, TONEDEN_CONFIG).valid;
}

/**
 * Validates and normalizes a ToneDen URL.
 */
export function validateToneDenUrl(url: string): string | null {
  const result = validatePlatformUrl(url, TONEDEN_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

/**
 * Extracts the link ID from a ToneDen URL.
 */
export function extractToneDenId(url: string): string | null {
  const result = validatePlatformUrl(url, TONEDEN_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

/**
 * Fetches a ToneDen smart link page.
 */
export async function fetchToneDenDocument(
  sourceUrl: string,
  timeoutMs = TONEDEN_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateToneDenUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid ToneDen URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: TONEDEN_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

/**
 * Unified fanlink type that handles both pageProps and direct data shapes
 */
interface ToneDenFanlink {
  title?: string;
  artistName?: string;
  artist?: string;
  subtitle?: string;
  imageUrl?: string;
  coverUrl?: string;
  image?: string;
  services?: Array<{
    url?: string;
    name?: string;
    platform?: string;
  }>;
  links?: Array<{
    url?: string;
    title?: string;
    label?: string;
  }>;
}

/**
 * Type for ToneDen's embedded JSON data
 */
interface ToneDenPageData {
  props?: {
    pageProps?: {
      fanlink?: ToneDenFanlink;
      gate?: {
        title?: string;
        artistName?: string;
        imageUrl?: string;
        actions?: Array<{
          url?: string;
          label?: string;
          type?: string;
        }>;
      };
    };
  };
  // ToneDen sometimes embeds data directly
  fanlink?: ToneDenFanlink;
}

/**
 * Extracts streaming platform links and metadata from ToneDen HTML.
 */
export function extractToneDen(html: string): ExtractionResult {
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
        sourcePlatform: 'toneden',
        evidence: {
          sources: ['toneden'],
          signals: ['toneden_smart_link'],
        },
      });
    } catch {
      return;
    }
  };

  // Try to extract from Next.js data
  const nextData = extractScriptJson<ToneDenPageData>(html, '__NEXT_DATA__');

  // Also try __TONEDEN_DATA__ which ToneDen sometimes uses
  const tonedenData = extractScriptJson<ToneDenPageData>(
    html,
    '__TONEDEN_DATA__'
  );

  // Also try window.__DATA__ pattern
  const windowData = extractScriptJson<ToneDenPageData>(html, '__DATA__');

  const pageData = nextData ?? tonedenData ?? windowData;

  // Extract from fanlink data
  const fanlink = pageData?.props?.pageProps?.fanlink ?? pageData?.fanlink;
  const gate = pageData?.props?.pageProps?.gate;

  if (fanlink?.services) {
    for (const service of fanlink.services) {
      addLink(service.url, service.name);
    }
  }

  if (fanlink?.links) {
    for (const link of fanlink.links) {
      addLink(link.url, link.title ?? link.label);
    }
  }

  if (gate?.actions) {
    for (const action of gate.actions) {
      if (action.type === 'link' || action.type === 'external') {
        addLink(action.url, action.label);
      }
    }
  }

  // Fallback: extract href attributes from HTML
  const hrefRegex = /href\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Also look for data attributes and onclick handlers with URLs
  const dataUrlRegex =
    /data-(?:href|url|link)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
  while ((match = dataUrlRegex.exec(html)) !== null) {
    addLink(match[1]);
  }

  // Extract display name (artist/release name)
  const displayName =
    fanlink?.artistName ??
    fanlink?.artist ??
    gate?.artistName ??
    fanlink?.title ??
    gate?.title ??
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Extract artwork as avatar
  const avatarUrl =
    fanlink?.imageUrl ??
    fanlink?.coverUrl ??
    fanlink?.image ??
    gate?.imageUrl ??
    extractMetaContent(html, 'og:image') ??
    null;

  return createExtractionResult(links, displayName, avatarUrl);
}

export { ExtractionError } from './base';
