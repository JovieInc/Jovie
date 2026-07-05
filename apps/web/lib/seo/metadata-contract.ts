import type { Metadata } from 'next';

/**
 * Presence flags for required SEO/AEO tags on a public route.
 * Used by the SEO ratchet (#11044) to detect silent regressions.
 */
export interface SeoTagPresence {
  readonly title: boolean;
  readonly description: boolean;
  readonly canonical: boolean;
  readonly openGraphTitle: boolean;
  readonly openGraphDescription: boolean;
  readonly openGraphUrl: boolean;
  readonly openGraphType: boolean;
  readonly twitterCard: boolean;
  readonly twitterTitle: boolean;
}

export type SeoTagKey = keyof SeoTagPresence;

export const SEO_TAG_KEYS: readonly SeoTagKey[] = [
  'title',
  'description',
  'canonical',
  'openGraphTitle',
  'openGraphDescription',
  'openGraphUrl',
  'openGraphType',
  'twitterCard',
  'twitterTitle',
] as const;

export const SEO_TAG_REMEDIATION: Readonly<Record<SeoTagKey, string>> = {
  title: 'Add a non-empty `title` (or `generateMetadata` title) on the route.',
  description:
    'Add a non-empty `description` in metadata — search snippets depend on it.',
  canonical:
    'Set `alternates.canonical` to the route absolute URL (import BASE_URL).',
  openGraphTitle: 'Set `openGraph.title` for social/AI preview cards.',
  openGraphDescription: 'Set `openGraph.description` for social previews.',
  openGraphUrl: 'Set `openGraph.url` to the canonical route URL.',
  openGraphType: 'Set `openGraph.type` (usually `website` or `profile`).',
  twitterCard: 'Set `twitter.card` (usually `summary_large_image`).',
  twitterTitle: 'Set `twitter.title` for Twitter/X previews.',
};

function resolveTitle(title: Metadata['title']): string {
  if (!title) return '';
  if (typeof title === 'string') return title.trim();
  if ('absolute' in title && typeof title.absolute === 'string') {
    return title.absolute.trim();
  }
  if ('default' in title && typeof title.default === 'string') {
    return title.default.trim();
  }
  return '';
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCanonical(metadata: Metadata): boolean {
  const canonical = metadata.alternates?.canonical;
  if (!canonical) return false;
  if (typeof canonical === 'string') return canonical.trim().length > 0;
  if (
    typeof canonical === 'object' &&
    canonical !== null &&
    'url' in canonical
  ) {
    return hasNonEmptyString((canonical as { url?: string }).url);
  }
  return false;
}

/**
 * Extract which required SEO tags are present on a Next.js Metadata object.
 */
export function extractSeoTagPresence(metadata: Metadata): SeoTagPresence {
  const openGraph = metadata.openGraph;
  const twitter = metadata.twitter;

  return {
    title: resolveTitle(metadata.title).length > 0,
    description: hasNonEmptyString(metadata.description),
    canonical: hasCanonical(metadata),
    openGraphTitle: resolveTitle(openGraph?.title).length > 0,
    openGraphDescription: hasNonEmptyString(openGraph?.description),
    openGraphUrl: hasNonEmptyString(openGraph?.url),
    openGraphType: hasNonEmptyString(
      openGraph && 'type' in openGraph ? openGraph.type : undefined
    ),
    twitterCard: hasNonEmptyString(
      twitter && 'card' in twitter ? twitter.card : undefined
    ),
    twitterTitle: resolveTitle(twitter?.title).length > 0,
  };
}

/**
 * Return human-readable violations for any missing required tags.
 */
export function collectSeoTagViolations(
  presence: SeoTagPresence,
  routeId: string
): string[] {
  const violations: string[] = [];
  for (const key of SEO_TAG_KEYS) {
    if (!presence[key]) {
      violations.push(
        `${routeId}: missing ${key} — ${SEO_TAG_REMEDIATION[key]}`
      );
    }
  }
  return violations;
}

/**
 * Ratchet compare: fail when a tag that was present in the baseline disappears.
 */
export function collectSeoRatchetRegressions(
  routeId: string,
  baseline: SeoTagPresence,
  current: SeoTagPresence
): string[] {
  const regressions: string[] = [];
  for (const key of SEO_TAG_KEYS) {
    if (baseline[key] && !current[key]) {
      regressions.push(
        `${routeId}: regressed ${key} (was present in seo-baseline.json) — ${SEO_TAG_REMEDIATION[key]}`
      );
    }
  }
  return regressions;
}
