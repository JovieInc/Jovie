/**
 * Thematic Profile Ingestion Strategy
 *
 * Extracts profile data and social links from Thematic profiles.
 * Supports both creator and artist profile types.
 *
 * URL patterns:
 * - Artist: https://app.hellothematic.com/artist/profile/{id}
 * - Creator: https://app.hellothematic.com/creator/profile/{id}
 *
 * Profile IDs are numeric and incremental, providing account age context.
 *
 * Note: Thematic blocks server-side requests with 403. This strategy uses
 * Browserless as a fallback for bot-protected pages. Set BROWSERLESS_API_KEY
 * environment variable to enable browser-based fetching.
 */

import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import {
  fetchWithBrowserless,
  isBrowserlessConfigured,
  shouldFallbackToBrowserless,
} from '../browserless';
import type { ExtractionResult } from '../types';
import {
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

const THEMATIC_CONFIG: StrategyConfig = {
  platformId: 'thematic',
  platformName: 'Thematic',
  canonicalHost: 'app.hellothematic.com',
  validHosts: new Set([
    'app.hellothematic.com',
    'hellothematic.com',
    'www.hellothematic.com',
  ]),
  defaultTimeoutMs: 15000,
};

/**
 * Thematic profile types that can be ingested.
 */
export type ThematicProfileType = 'artist' | 'creator';

/**
 * Result from parsing a Thematic URL.
 */
export interface ThematicUrlParts {
  profileType: ThematicProfileType;
  profileId: string;
}

// Hosts to skip when extracting links (internal Thematic navigation)
const SKIP_HOSTS = new Set([
  'app.hellothematic.com',
  'hellothematic.com',
  'www.hellothematic.com',
]);

// Regex patterns for extracting social links from Thematic pages
const SOCIAL_LINK_PATTERNS: Record<string, RegExp> = {
  youtube: /(?:youtube\.com\/(?:channel\/|c\/|@)?|youtu\.be\/)[\w-]+/i,
  instagram: /instagram\.com\/[\w.]+/i,
  tiktok: /tiktok\.com\/@?[\w.]+/i,
  twitter: /(?:twitter\.com|x\.com)\/[\w]+/i,
  spotify: /open\.spotify\.com\/(?:artist|user)\/[\w]+/i,
  soundcloud: /soundcloud\.com\/[\w-]+/i,
  facebook: /facebook\.com\/[\w.]+/i,
  twitch: /twitch\.tv\/[\w]+/i,
};

// Regex to extract href attributes
const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;

// ============================================================================
// URL Validation and Parsing
// ============================================================================

/**
 * Parses a Thematic URL and extracts the profile type and ID.
 * Returns null if the URL is not a valid Thematic profile URL.
 */
export function parseThematicUrl(url: string): ThematicUrlParts | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!THEMATIC_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    // Expected path format: /{artist|creator}/profile/{id}
    const pathMatch = parsed.pathname.match(
      /^\/(artist|creator)\/profile\/(\d+)\/?$/i
    );
    if (!pathMatch) {
      return null;
    }

    const profileType = pathMatch[1].toLowerCase() as ThematicProfileType;
    const profileId = pathMatch[2];

    return { profileType, profileId };
  } catch {
    return null;
  }
}

/**
 * Validates that a URL is a valid Thematic profile URL.
 */
export function isThematicUrl(url: string): boolean {
  return parseThematicUrl(url) !== null;
}

/**
 * Validates and normalizes a Thematic URL.
 * Returns the canonical URL or null if invalid.
 */
export function validateThematicUrl(url: string): string | null {
  const parts = parseThematicUrl(url);
  if (!parts) {
    return null;
  }
  return `https://${THEMATIC_CONFIG.canonicalHost}/${parts.profileType}/profile/${parts.profileId}`;
}

/**
 * Extracts the Thematic profile type from a URL.
 */
export function extractThematicProfileType(
  url: string
): ThematicProfileType | null {
  const parts = parseThematicUrl(url);
  return parts?.profileType ?? null;
}

/**
 * Extracts the Thematic profile ID from a URL.
 * This can be used to estimate account age (lower IDs = older accounts).
 */
export function extractThematicProfileId(url: string): string | null {
  const parts = parseThematicUrl(url);
  return parts?.profileId ?? null;
}

/**
 * Generates a handle from the Thematic profile URL.
 * Format: thematic_{type}_{id} (e.g., thematic_artist_198908)
 */
export function extractThematicHandle(url: string): string | null {
  const parts = parseThematicUrl(url);
  if (!parts) {
    return null;
  }
  return `thematic_${parts.profileType}_${parts.profileId}`;
}

/**
 * Normalizes a Thematic handle for storage.
 */
export function normalizeThematicHandle(handle: string): string {
  return handle.toLowerCase().trim();
}

// ============================================================================
// Document Fetching
// ============================================================================

/**
 * Try a simple HTTP fetch first (free and fast).
 * This will likely fail with 403 for Thematic, but we try anyway.
 */
async function trySimpleFetch(
  url: string,
  timeoutMs: number
): Promise<string | null> {
  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 1, // Don't retry on 403
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      // Try adding a referer to look more like a browser
      Referer: 'https://www.google.com/',
    },
    allowedHosts: THEMATIC_CONFIG.validHosts,
  };

  try {
    const result = await fetchDocument(url, options);
    return result.html;
  } catch (error) {
    // Check if this is a bot-blocking error
    if (shouldFallbackToBrowserless(error)) {
      logger.info('Simple fetch blocked, will try Browserless', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Fetches the HTML content of a Thematic profile.
 *
 * Strategy:
 * 1. Try simple HTTP fetch first (free, fast)
 * 2. If blocked (403), fall back to Browserless (costs money but works)
 *
 * Browserless is optimized for speed to minimize costs:
 * - Blocks images/fonts/CSS
 * - Uses small viewport
 * - Exits immediately after extraction
 * - Targets <15s execution (one 30s billing block)
 */
export async function fetchThematicDocument(
  sourceUrl: string,
  timeoutMs = THEMATIC_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateThematicUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Thematic URL', 'INVALID_URL');
  }

  // Try simple fetch first (free)
  const simpleResult = await trySimpleFetch(validatedUrl, timeoutMs);
  if (simpleResult) {
    logger.info('Thematic profile fetched via simple HTTP', { url: validatedUrl });
    return simpleResult;
  }

  // Fall back to Browserless if configured
  if (!isBrowserlessConfigured()) {
    throw new ExtractionError(
      'Thematic blocks server requests. Set BROWSERLESS_API_KEY to enable browser-based fetching.',
      'FETCH_FAILED'
    );
  }

  logger.info('Fetching Thematic profile via Browserless', { url: validatedUrl });

  try {
    const browserResult = await fetchWithBrowserless({
      url: validatedUrl,
      pageLoadTimeout: 10000,
      operationTimeout: 15000,
      blockResources: true,
      // Wait for profile content to load
      waitForSelector: 'main, [data-testid="profile"], .profile, #profile',
    });

    logger.info('Thematic profile fetched via Browserless', {
      url: validatedUrl,
      durationMs: browserResult.durationMs,
    });

    return browserResult.html;
  } catch (error) {
    logger.error('Browserless fetch failed for Thematic', {
      url: validatedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExtractionError(
      `Failed to fetch Thematic profile: ${error instanceof Error ? error.message : String(error)}`,
      'FETCH_FAILED'
    );
  }
}

// ============================================================================
// Data Extraction
// ============================================================================

/**
 * Extracted Thematic profile data including metadata specific to Thematic.
 */
export interface ThematicExtractionResult extends ExtractionResult {
  /** Profile type: artist or creator */
  thematicProfileType: ThematicProfileType;
  /** Numeric profile ID (indicates account age) */
  thematicProfileId: string;
  /** Whether the profile is verified on Thematic */
  isVerified: boolean;
  /** Subscriber/follower count if available */
  followerCount?: number;
}

/**
 * Extracts profile data and links from Thematic HTML.
 *
 * Handles extraction of:
 * - Display name and avatar from meta tags
 * - Social links from the page
 * - Verified status badge
 * - Profile type (artist vs creator)
 */
export function extractThematic(
  html: string,
  urlParts: ThematicUrlParts
): ThematicExtractionResult {
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

      // Require https and skip internal Thematic hosts
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
        sourcePlatform: 'thematic',
        evidence: {
          sources: ['thematic'],
          signals: [
            `thematic_${urlParts.profileType}_profile`,
            `thematic_profile_id_${urlParts.profileId}`,
          ],
        },
      });
    } catch {
      // Skip unparseable URLs
      return;
    }
  };

  // Extract social links from href attributes
  HREF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_REGEX.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref || rawHref.startsWith('#')) continue;

    const normalized = rawHref.trim().toLowerCase();

    // Block dangerous schemes
    if (normalized.startsWith('javascript:')) continue;
    if (normalized.startsWith('mailto:')) continue;
    if (normalized.startsWith('tel:')) continue;
    if (normalized.startsWith('data:')) continue;
    if (normalized.startsWith('vbscript:')) continue;

    // Require explicit https scheme
    if (!normalized.startsWith('https://')) continue;

    // Check if it matches any social platform pattern
    const isSocialLink = Object.values(SOCIAL_LINK_PATTERNS).some(pattern =>
      pattern.test(rawHref)
    );

    if (isSocialLink) {
      addLink(rawHref);
    }
  }

  // Also extract from specific social link containers if present
  // Look for common patterns like data attributes or specific class names
  const socialLinkMatches = html.matchAll(
    /(?:social[_-]?link|external[_-]?link)[^>]*href=["']([^"']+)["']/gi
  );
  for (const linkMatch of socialLinkMatches) {
    addLink(linkMatch[1]);
  }

  // Extract display name from meta tags or page content
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " | Thematic" or similar suffixes)
  if (displayName) {
    displayName = displayName
      .replace(/\s*[|–-]\s*Thematic.*$/i, '')
      .replace(/\s*on\s+Thematic.*$/i, '')
      .trim();
  }

  // Extract avatar URL from meta tags
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

  const avatarUrl =
    sanitizeAvatar(extractMetaContent(html, 'og:image')) ??
    sanitizeAvatar(extractMetaContent(html, 'twitter:image')) ??
    null;

  // Detect verified status
  // Look for verified badge indicators in the HTML
  const isVerified =
    /verified[_-]?badge/i.test(html) ||
    /class=["'][^"']*verified[^"']*["']/i.test(html) ||
    /is[_-]?verified["':\s]+true/i.test(html) ||
    /verified["']?\s*:\s*true/i.test(html);

  // Try to extract follower count
  let followerCount: number | undefined;
  const followerMatch = html.match(
    /(?:followers?|subscribers?)[:\s]*([0-9,]+(?:\.[0-9]+)?[KkMm]?)/i
  );
  if (followerMatch) {
    const countStr = followerMatch[1].replace(/,/g, '');
    let count = parseFloat(countStr);
    if (countStr.toLowerCase().endsWith('k')) {
      count *= 1000;
    } else if (countStr.toLowerCase().endsWith('m')) {
      count *= 1000000;
    }
    if (!isNaN(count)) {
      followerCount = Math.round(count);
    }
  }

  const baseResult = createExtractionResult(links, displayName, avatarUrl);

  return {
    ...baseResult,
    thematicProfileType: urlParts.profileType,
    thematicProfileId: urlParts.profileId,
    isVerified,
    followerCount,
  };
}

/**
 * Maps Thematic profile type to Jovie creator type.
 */
export function mapThematicTypeToCreatorType(
  thematicType: ThematicProfileType
): 'artist' | 'creator' {
  // Direct mapping - Thematic artist -> artist, creator -> creator
  return thematicType;
}

// ============================================================================
// Exports
// ============================================================================

export { THEMATIC_CONFIG };
