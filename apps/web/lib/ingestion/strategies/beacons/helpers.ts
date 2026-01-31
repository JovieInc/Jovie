/**
 * Beacons Extraction Helpers
 *
 * Helper functions for extracting data from Beacons.ai pages.
 */

import { decodeHtmlEntities, extractScriptJson } from '../base';

/**
 * Cleans up Beacons display name by removing platform suffixes.
 */
export function cleanBeaconsDisplayName(name: string): string {
  const safeName = name.slice(0, 200);
  return (
    safeName
      // Handle " | Beacons" and variations
      .replace(/\s*\|\s*Beacons(?:\.ai)?$/i, '')
      // Handle " - Beacons.ai" and variations
      .replace(/\s*-\s*Beacons(?:\.ai)?$/i, '')
      // Handle "on Beacons.ai" and variations
      .replace(/\s+on\s+Beacons(?:\.ai)?$/i, '')
      // Handle "'s Beacons.ai" and variations
      // Note: ['\u2019] matches both U+0027 (') and U+2019 (') apostrophe variants
      .replace(/['\u2019]s\s+Beacons(?:\.ai)?$/i, '')
      // Handle just "Beacons" at the end
      .replace(/\s+Beacons(?:\.ai)?$/i, '')
      .trim()
  );
}

/**
 * Checks if an image URL is a default Beacons placeholder image.
 */
export function isDefaultBeaconsImage(url: string): boolean {
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
export function extractJsonLd(
  html: string
): { name?: string; image?: string } | null {
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
export function extractBeaconsSpecificData(html: string): {
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
    const match = pattern.exec(html);
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
    const match = pattern.exec(html);
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

export type StructuredLink = { url?: string | null; title?: string | null };

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

/**
 * Try to extract a URL from a candidate object.
 * Returns the URL and optional title if found, null otherwise.
 */
function extractUrlFromCandidate(
  candidate: Record<string, unknown>
): StructuredLink | null {
  const urlCandidate = (candidate.url ?? candidate.linkUrl ?? candidate.href) as
    | string
    | null
    | undefined;

  if (typeof urlCandidate !== 'string') return null;

  return {
    url: urlCandidate,
    title:
      (candidate.title as string | undefined) ??
      (candidate.name as string | undefined) ??
      (candidate.label as string | undefined) ??
      (candidate.text as string | undefined),
  };
}

/**
 * Extracts dehydrated query links from page props.
 */
function extractDehydratedLinks(queries: unknown): unknown[] {
  if (!Array.isArray(queries)) return [];

  const links: unknown[] = [];
  for (const query of queries) {
    if (!query || typeof query !== 'object') continue;
    const data = (query as { state?: { data?: unknown } }).state?.data;
    if (!data || typeof data !== 'object') continue;

    links.push(
      (data as { links?: unknown }).links,
      (data as { page?: { links?: unknown } }).page?.links
    );
  }
  return links;
}

/**
 * Adds a link to the structured list if not already seen.
 */
function addUniqueLink(
  link: StructuredLink | null,
  seen: Set<string>,
  structured: StructuredLink[]
): void {
  if (!link?.url) return;
  const key = link.url.trim();
  if (seen.has(key)) return;
  seen.add(key);
  structured.push(link);
}

/**
 * Recursively collects links from a value.
 */
function collectLinks(
  value: unknown,
  seen: Set<string>,
  structured: StructuredLink[]
): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const entry of value) collectLinks(entry, seen, structured);
    return;
  }

  if (typeof value !== 'object') return;

  const candidate = value as Record<string, unknown>;
  addUniqueLink(extractUrlFromCandidate(candidate), seen, structured);

  // Recurse into nested collections
  for (const key of ['links', 'items', 'children', 'buttons'] as const) {
    if (candidate[key]) collectLinks(candidate[key], seen, structured);
  }
}

/**
 * Extracts structured links from Beacons Next.js page data.
 */
export function extractBeaconsStructuredLinks(html: string): StructuredLink[] {
  const nextData = extractScriptJson<BeaconsPageProps>(html, '__NEXT_DATA__');
  const structured: StructuredLink[] = [];
  const seen = new Set<string>();

  const pageProps = nextData?.props?.pageProps;
  if (pageProps) {
    const candidateCollections = [
      pageProps.links,
      pageProps.profile?.links,
      pageProps.data?.links,
      ...extractDehydratedLinks(pageProps.dehydratedState?.queries),
    ];

    for (const collection of candidateCollections) {
      collectLinks(collection, seen, structured);
    }
  }

  // Extract from data attributes
  const dataHrefRegex = /data-(?:href|url)=["'](https?:[^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = dataHrefRegex.exec(html)) !== null) {
    addUniqueLink({ url: match[1], title: undefined }, seen, structured);
  }

  return structured;
}
