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
      .replace(/['']s\s+Beacons(?:\.ai)?$/i, '')
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
 * Extracts structured links from Beacons Next.js page data.
 */
export function extractBeaconsStructuredLinks(html: string): StructuredLink[] {
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
      for (const entry of value) collect(entry);
      return;
    }

    if (typeof value !== 'object') return;

    const candidate = value as Record<string, unknown>;
    const link = extractUrlFromCandidate(candidate);

    if (link?.url) {
      const key = link.url.trim();
      if (!seen.has(key)) {
        seen.add(key);
        structured.push(link);
      }
    }

    // Recurse into nested collections
    const nestedKeys = ['links', 'items', 'children', 'buttons'] as const;
    for (const key of nestedKeys) {
      if (candidate[key]) collect(candidate[key]);
    }
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
