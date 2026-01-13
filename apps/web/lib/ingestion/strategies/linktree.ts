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
import { normalizeString } from '@/lib/utils/string-utils';
import type { ExtractionResult } from '../types';
import {
  normalizeHandle as baseNormalizeHandle,
  createExtractionResult,
  ExtractionError,
  extractMetaContent,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  isPlatformUrl,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

// ============================================================================
// Configuration
// ============================================================================

const LINKTREE_CONFIG: StrategyConfig = {
  platformId: 'linktree',
  platformName: 'Linktree',
  canonicalHost: 'linktr.ee',
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

/**
 * Patterns that indicate free tier Linktree branding.
 * Paid tier profiles have this branding removed.
 */
const LINKTREE_BRANDING_PATTERNS = [
  // Text branding patterns
  /made\s+with\s+linktree/i,
  /create\s+your\s+(own\s+)?linktree/i,
  /get\s+your\s+(own\s+)?linktree/i,
  /join\s+linktree/i,
  /powered\s+by\s+linktree/i,
  // Footer link to Linktree home
  /href\s*=\s*["']https?:\/\/(www\.)?linktr\.ee\/?["']/i,
  // Linktree logo SVG patterns (aria-label or alt text)
  /aria-label\s*=\s*["']linktree\s*(logo)?["']/i,
  /alt\s*=\s*["']linktree\s*(logo)?["']/i,
];

// Regex to extract href attributes
const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;

type StructuredLink = { url?: string | null; title?: string | null };

/**
 * Detect if a Linktree profile is on a paid tier by checking for branding.
 * Free tier profiles display "Made with Linktree" or similar branding.
 * Paid tier profiles have this removed.
 *
 * @param html - The HTML content of the Linktree page
 * @returns true if paid tier (no branding), false if free tier (has branding), null if uncertain
 */
export function detectLinktreePaidTier(html: string): boolean | null {
  // Check the footer section specifically (last ~5000 chars) for efficiency
  // Branding is typically at the bottom of the page
  const footerSection = html.slice(-5000);

  for (const pattern of LINKTREE_BRANDING_PATTERNS) {
    if (pattern.test(footerSection) || pattern.test(html)) {
      // Found branding = free tier
      return false;
    }
  }

  // No branding found = likely paid tier
  // But we only confidently say "paid" if we found links (indicating a real profile)
  // This prevents false positives on error pages or empty profiles
  if (html.includes('href=')) {
    return true;
  }

  // Can't determine
  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Linktree profile URL.
 * Uses shared validation logic from base module.
 */
export function isLinktreeUrl(url: string): boolean {
  if (!isPlatformUrl(url, LINKTREE_CONFIG)) {
    return false;
  }

  // Additional Linktree-specific validation: check handle format
  const handle = extractLinktreeHandle(url);
  return handle !== null && handle.length > 0;
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
  return `https://${LINKTREE_CONFIG.canonicalHost}/${result.handle}`;
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
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      // Linktree may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: LINKTREE_CONFIG.validHosts,
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
type LinktreePageProps = {
  props?: {
    pageProps?: {
      seo?: { title?: string | null; image?: string | null };
      links?: unknown;
      allLinks?: unknown;
      user?: {
        fullName?: string | null;
        profilePicture?: { url?: string | null } | null;
      };
      account?: { displayName?: string | null; profilePicture?: string | null };
      page?: { links?: unknown };
      data?: { links?: unknown };
      profile?: { links?: unknown };
      linkData?: unknown;
      dehydratedState?: { queries?: unknown };
    };
  };
  query?: { handle?: string };
};

export function extractLinktree(html: string): ExtractionResult {
  const nextData = extractScriptJson<LinktreePageProps>(html, '__NEXT_DATA__');

  const nextDisplayName =
    nextData?.props?.pageProps?.seo?.title ??
    nextData?.props?.pageProps?.user?.fullName ??
    nextData?.props?.pageProps?.account?.displayName ??
    null;

  const sanitizeAvatar = (candidate?: string | null): string | null => {
    if (!candidate) return null;
    try {
      const parsed = new URL(
        candidate.startsWith('http') ? candidate : `https://${candidate}`
      );
      if (parsed.protocol !== 'https:') return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  const domAvatarMatch = html.match(
    /id=["']profile-picture["'][^>]*\s(?:src|data-src)=["']([^"']+)["']/i
  );
  const domAvatar = sanitizeAvatar(domAvatarMatch?.[1] ?? null);

  const nextAvatar = sanitizeAvatar(
    nextData?.props?.pageProps?.seo?.image ??
      nextData?.props?.pageProps?.user?.profilePicture?.url ??
      nextData?.props?.pageProps?.account?.profilePicture ??
      null
  );

  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();

  const addLink = (
    rawUrl: string | undefined | null,
    title?: string | null
  ) => {
    if (!rawUrl) return;

    try {
      const normalizedHref = normalizeUrl(rawUrl);
      const parsed = new URL(normalizedHref);

      // Require https and skip internal Linktree or asset hosts
      if (parsed.protocol !== 'https:') return;
      if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return;

      const detected = detectPlatform(normalizedHref);
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
        sourcePlatform: 'linktree',
        evidence: {
          sources: ['linktree'],
          signals: ['linktree_profile_link'],
        },
      });
    } catch {
      // Skip unparseable URLs
      return;
    }
  };

  for (const structuredLink of extractStructuredLinks(nextData)) {
    addLink(structuredLink.url, structuredLink.title);
  }

  // Fallback: extract href attributes to maintain recall
  HREF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_REGEX.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref || rawHref.startsWith('#')) continue;

    // Normalize and trim to prevent bypass via whitespace/case
    const normalized = normalizeString(rawHref);

    // Block dangerous schemes (case-insensitive)
    if (normalized.startsWith('javascript:')) continue;
    if (normalized.startsWith('mailto:')) continue;
    if (normalized.startsWith('tel:')) continue;
    if (normalized.startsWith('data:')) continue;
    if (normalized.startsWith('vbscript:')) continue;

    // Require explicit https scheme (reject http or protocol-relative)
    if (!normalized.startsWith('https://')) continue;

    addLink(rawHref);
  }

  // Extract display name from meta tags
  let displayName =
    nextDisplayName ??
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

  if (displayName && /links?\b/i.test(displayName) && nextData?.query?.handle) {
    displayName = nextData.query.handle;
  }

  // Extract avatar from Next.js data or meta tags
  const avatarUrl =
    domAvatar ??
    nextAvatar ??
    sanitizeAvatar(extractMetaContent(html, 'og:image')) ??
    sanitizeAvatar(extractMetaContent(html, 'twitter:image')) ??
    null;

  // Detect paid tier by checking for branding
  const hasPaidTier = detectLinktreePaidTier(html);

  return createExtractionResult(links, displayName, avatarUrl, hasPaidTier);
}

function extractStructuredLinks(
  nextData: LinktreePageProps | null
): StructuredLink[] {
  if (!nextData?.props?.pageProps) {
    return [];
  }

  const structured: StructuredLink[] = [];
  const pageProps = nextData.props.pageProps;

  const candidateCollections: unknown[] = [
    pageProps.links,
    pageProps.allLinks,
    (pageProps as { page?: { links?: unknown } }).page?.links,
    (pageProps as { data?: { links?: unknown } }).data?.links,
    (pageProps as { profile?: { links?: unknown } }).profile?.links,
    (pageProps as { linkData?: unknown }).linkData,
  ];

  const dehydratedQueries = (
    pageProps as { dehydratedState?: { queries?: unknown } }
  ).dehydratedState?.queries;
  if (Array.isArray(dehydratedQueries)) {
    for (const query of dehydratedQueries) {
      if (!query || typeof query !== 'object') continue;
      const data = (query as { state?: { data?: unknown } }).state?.data;
      if (data && typeof data === 'object') {
        candidateCollections.push((data as { links?: unknown }).links);
        candidateCollections.push(
          (data as { page?: { links?: unknown } }).page?.links
        );
      }
    }
  }

  const seen = new Set<string>();

  const collect = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        collect(entry);
      }
      return;
    }

    if (typeof value !== 'object') return;
    const candidate = value as Record<string, unknown>;
    const urlCandidate = (candidate.url ??
      candidate.linkUrl ??
      candidate.href) as string | null | undefined;

    if (typeof urlCandidate === 'string') {
      const key = urlCandidate.trim();
      if (!seen.has(key)) {
        seen.add(key);
        structured.push({
          url: urlCandidate,
          title:
            (candidate.title as string | undefined) ??
            (candidate.name as string | undefined) ??
            (candidate.label as string | undefined) ??
            (candidate.text as string | undefined),
        });
      }
    }

    if (candidate.links) collect(candidate.links);
    if (candidate.items) collect(candidate.items);
    if (candidate.children) collect(candidate.children);
    if (candidate.buttons) collect(candidate.buttons);
  };

  for (const collection of candidateCollections) {
    collect(collection);
  }

  return structured;
}
