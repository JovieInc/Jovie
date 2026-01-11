/**
 * Beacons.ai Profile Ingestion Strategy
 *
 * Extracts profile data and links from Beacons.ai profiles.
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
  decodeHtmlEntities,
  ExtractionError,
  extractLinks,
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

/**
 * Patterns that indicate free tier Beacons branding.
 * Paid tier profiles have this branding removed.
 */
const BEACONS_BRANDING_PATTERNS = [
  // Text branding patterns
  /made\s+with\s+beacons/i,
  /powered\s+by\s+beacons/i,
  /create\s+your\s+(own\s+)?beacons/i,
  /get\s+your\s+(own\s+)?beacons/i,
  /join\s+beacons/i,
  /try\s+beacons/i,
  // Footer link to Beacons home
  /href\s*=\s*["']https?:\/\/(www\.)?beacons\.ai\/?["']/i,
  // Beacons logo patterns (aria-label or alt text)
  /aria-label\s*=\s*["']beacons\s*(logo)?["']/i,
  /alt\s*=\s*["']beacons\s*(logo)?["']/i,
  // Beacons branding in class names
  /class\s*=\s*["'][^"]*beacons[-_]?branding[^"]*["']/i,
];

type StructuredLink = { url?: string | null; title?: string | null };

/**
 * Detect if a Beacons profile is on a paid tier by checking for branding.
 * Free tier profiles display "Made with Beacons" or similar branding.
 * Paid tier profiles have this removed.
 *
 * @param html - The HTML content of the Beacons page
 * @returns true if paid tier (no branding), false if free tier (has branding), null if uncertain
 */
export function detectBeaconsPaidTier(html: string): boolean | null {
  // Check the footer section specifically (last ~5000 chars) for efficiency
  const footerSection = html.slice(-5000);

  for (const pattern of BEACONS_BRANDING_PATTERNS) {
    if (pattern.test(footerSection) || pattern.test(html)) {
      // Found branding = free tier
      return false;
    }
  }

  // No branding found = likely paid tier
  // But only say "paid" if we found links (indicating a real profile)
  if (html.includes('href=')) {
    return true;
  }

  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates that a URL is a valid Beacons.ai profile URL.
 * Uses shared validation logic from base module.
 */
export function isBeaconsUrl(url: string): boolean {
  if (!isPlatformUrl(url, BEACONS_CONFIG)) {
    return false;
  }

  // Additional Beacons-specific validation: check handle format
  const handle = extractBeaconsHandle(url);
  return handle !== null && handle.length > 0;
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
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
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
        sourcePlatform: 'beacons',
        evidence: {
          sources: ['beacons'],
          signals: ['beacons_profile_link'],
        },
      });
    } catch {
      return;
    }
  };

  const structuredLinks = extractBeaconsStructuredLinks(html);
  for (const link of structuredLinks) {
    addLink(link.url, link.title);
  }

  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'beacons',
    sourceSignal: 'beacons_profile_link',
  });

  for (const link of fallbackLinks) {
    addLink(link.url, link.title);
  }

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

  // Detect paid tier by checking for branding
  const hasPaidTier = detectBeaconsPaidTier(html);

  return createExtractionResult(links, displayName, avatarUrl, hasPaidTier);
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

interface BeaconsPageProps {
  props?: {
    pageProps?: {
      links?: unknown;
      profile?: { links?: unknown };
      data?: { links?: unknown };
      dehydratedState?: { queries?: unknown };
    };
  };
}

function extractBeaconsStructuredLinks(html: string): StructuredLink[] {
  const nextData = extractScriptJson<BeaconsPageProps>(html, '__NEXT_DATA__');
  const structured: StructuredLink[] = [];
  const seen = new Set<string>();

  const candidateCollections: unknown[] = [];

  const pageProps = nextData?.props?.pageProps;
  if (pageProps) {
    candidateCollections.push(pageProps.links);
    candidateCollections.push(pageProps.profile?.links);
    candidateCollections.push(pageProps.data?.links);

    const dehydrated = pageProps.dehydratedState?.queries;
    if (Array.isArray(dehydrated)) {
      for (const query of dehydrated) {
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
  }

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

  const dataHrefRegex = /data-(?:href|url)=["'](https?:[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = dataHrefRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    if (!seen.has(rawUrl)) {
      seen.add(rawUrl);
      structured.push({ url: rawUrl, title: undefined });
    }
  }

  return structured;
}
