/**
 * Stan.me Profile Ingestion Strategy
 *
 * Extracts profile data and links from Stan.me pages.
 * Prioritizes structured data and falls back to HTML link extraction with safe defaults.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractedLink, ExtractionResult } from '../types';
import {
  normalizeHandle as baseNormalizeHandle,
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

// =============================================================================
// Configuration
// =============================================================================

const STAN_CONFIG: StrategyConfig = {
  platformId: 'stan',
  platformName: 'Stan',
  validHosts: new Set(['stan.me', 'www.stan.me']),
  defaultTimeoutMs: 10000,
};

const SKIP_HOSTS = new Set([
  'stan.me',
  'www.stan.me',
  'cdn.stan.me',
  'assets.stan.me',
  'static.stan.me',
]);

// =============================================================================
// Public API
// =============================================================================

export function isStanUrl(url: string): boolean {
  return validateStanUrl(url) !== null;
}

export function validateStanUrl(url: string): string | null {
  const result = validatePlatformUrl(url, STAN_CONFIG);

  if (!result.valid || !result.handle) {
    return null;
  }

  return `https://${Array.from(STAN_CONFIG.validHosts)[0]}/${result.handle}`;
}

export function normalizeStanHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

export function extractStanHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!STAN_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    return parts[0].replace(/^@/, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function fetchStanDocument(
  sourceUrl: string,
  timeoutMs = STAN_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateStanUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Stan URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://jov.ie)',
    allowedHosts: STAN_CONFIG.validHosts,
    maxResponseBytes: 2_000_000,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

export function extractStan(html: string): ExtractionResult {
  const structured = extractStructuredStan(html);

  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'stan',
    sourceSignal: 'stan_profile_link',
  });

  let links = structured?.links ?? [];
  if (links.length === 0) {
    links = fallbackLinks;
  } else {
    const existing = new Set(links.map(link => normalizeUrl(link.url)));
    for (const link of fallbackLinks) {
      const normalized = normalizeUrl(link.url);
      if (!existing.has(normalized)) {
        existing.add(normalized);
        links.push(link);
      }
    }
  }

  let displayName =
    structured?.displayName ??
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  if (displayName) {
    displayName = cleanStanDisplayName(displayName);
  }

  const avatarUrl =
    structured?.avatarUrl ??
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  return createExtractionResult(links, displayName, avatarUrl);
}

// =============================================================================
// Internal helpers
// =============================================================================

type StanStructuredData = {
  props?: {
    pageProps?: {
      pageData?: StanProfilePayload;
      page?: StanProfilePayload;
      profile?: StanProfilePayload;
      seo?: { title?: string | null; image?: string | null };
    };
  };
};

type StanProfilePayload = {
  displayName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  profileImage?: string | null;
  image?: string | null;
  links?: StanLinkPayload[];
  blocks?: StanLinkPayload[];
};

type StanLinkPayload = {
  url?: string | null;
  linkUrl?: string | null;
  href?: string | null;
  title?: string | null;
  label?: string | null;
  name?: string | null;
};

function extractStructuredStan(html: string): {
  displayName: string | null;
  avatarUrl: string | null;
  links: ExtractedLink[];
} | null {
  const nextData = extractScriptJson<StanStructuredData>(html, '__NEXT_DATA__');
  const payload =
    nextData?.props?.pageProps?.pageData ||
    nextData?.props?.pageProps?.page ||
    nextData?.props?.pageProps?.profile;

  if (!payload) {
    return null;
  }

  const links = collectStanLinks(payload.links ?? payload.blocks ?? []);

  const displayName =
    payload.displayName ??
    payload.name ??
    nextData?.props?.pageProps?.seo?.title ??
    null;

  const avatarUrl =
    payload.avatarUrl ?? payload.profileImage ?? payload.image ?? null;

  if (!displayName && !avatarUrl && links.length === 0) {
    return null;
  }

  return {
    displayName: displayName ?? null,
    avatarUrl: avatarUrl ?? null,
    links,
  };
}

function collectStanLinks(entries: StanLinkPayload[]): ExtractedLink[] {
  const links: ExtractedLink[] = [];

  for (const entry of entries) {
    const url = entry.url || entry.linkUrl || entry.href;
    if (!url || typeof url !== 'string') continue;

    const title = entry.title || entry.label || entry.name || undefined;
    links.push({
      url,
      title: title ?? undefined,
      sourcePlatform: 'stan',
      evidence: {
        sources: ['ingestion'],
        signals: ['stan_profile_link'],
      },
    });
  }

  return links;
}

function cleanStanDisplayName(name: string): string {
  return name
    .replace(/\s*\|\s*Stan(?:\.me)?$/i, '')
    .replace(/\s*-\s*Stan(?:\.me)?$/i, '')
    .trim();
}
