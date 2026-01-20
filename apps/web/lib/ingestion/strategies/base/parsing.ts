/**
 * HTML Parsing Utilities
 *
 * Functions for extracting data from HTML content.
 */

import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractedLink } from '../../types';
import {
  HREF_REGEX,
  TRACKING_HOSTS,
  TRACKING_PARAMS,
  UNSUPPORTED_SCHEMES,
} from './constants';
import type { LinkExtractionOptions } from './types';
import { decodeHtmlEntities } from './utils';

/**
 * Extracts JSON content from a script tag with a given id.
 */
export function extractScriptJson<T = unknown>(
  html: string,
  scriptId: string
): T | null {
  try {
    const pattern = new RegExp(
      `<script[^>]*id=["']${escapeRegex(scriptId)}["'][^>]*>([\\s\\S]*?)<\\/script>`,
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

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
