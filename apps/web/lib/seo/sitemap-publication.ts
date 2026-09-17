import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { isOpaqueInternalProfileHandle } from '@/lib/profile/opaque-internal-profile-handle';

export interface SitemapManifestRoute {
  readonly url: string;
  readonly status: 'active' | 'deprecated' | 'removed';
  readonly noindex?: boolean;
  readonly aliasOf?: string;
  readonly recipeId?: string;
  readonly healthCheck?: {
    readonly expected?: 'page' | 'redirect' | 'not-found';
  };
}

export interface SitemapInventoryEntry {
  readonly url: string;
  readonly lastModified?: Date | string;
}

const COMMERCIAL_RECIPES = new Set([
  'homepage',
  'pricing',
  'artist-lp',
  'feature',
  'launch',
  'comparison',
  'seo',
]);

const AUTH_PRIVATE_PATHS = new Set(['/waitlist', '/waitlist/invite']);

export const SITEMAP_PUBLISHED_LEGAL_PATHS = [
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/dmca',
] as const;

export const SITEMAP_PUBLISHED_MACHINE_PATHS = [
  '/openapi.json',
  '/llms.txt',
  '/llms-full.txt',
] as const;

export function isEditorialSitemapPath(path: string): boolean {
  return /^(?:\/blog|\/changelog|\/engineering)(?:\/|$)/.test(path);
}

export function toContentRevisionDate(
  value: Date | string | number | null | undefined
): Date | undefined {
  if (value == null || value === '') return undefined;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function latestContentRevision(
  ...values: Array<Date | string | number | null | undefined>
): Date | undefined {
  const dates = values
    .map(value => toContentRevisionDate(value))
    .filter((value): value is Date => value !== undefined);
  if (dates.length === 0) return undefined;
  return new Date(Math.max(...dates.map(date => date.getTime())));
}

export function sitemapPathname(url: string): string {
  try {
    const parsed = new URL(url, 'https://jov.ie');
    const normalized = parsed.pathname.replace(/\/+$/, '');
    return normalized === '' ? '/' : normalized;
  } catch {
    const normalized = url.split(/[?#]/u)[0]?.replace(/\/+$/, '') ?? '';
    return normalized === '' ? '/' : normalized;
  }
}

export function isSitemapIndexableMarketingRoute(
  entry: SitemapManifestRoute
): boolean {
  if (entry.status !== 'active' || entry.noindex || entry.aliasOf) return false;
  if (entry.url === '/renders' || entry.url.startsWith('/renders/')) {
    return false;
  }
  if (AUTH_PRIVATE_PATHS.has(entry.url)) return false;
  if (
    !entry.url.includes('*') &&
    (entry.healthCheck?.expected ?? 'page') !== 'page'
  ) {
    return false;
  }
  return true;
}

export function getExactPublishedMarketingPaths(
  manifest: readonly SitemapManifestRoute[] = MARKETING_ROUTE_MANIFEST
): string[] {
  return manifest
    .filter(isSitemapIndexableMarketingRoute)
    .filter(entry => !entry.url.includes('*'))
    .map(entry => entry.url);
}

export function getPublishedCommercialHubPaths(
  manifest: readonly SitemapManifestRoute[] = MARKETING_ROUTE_MANIFEST
): string[] {
  return manifest
    .filter(isSitemapIndexableMarketingRoute)
    .filter(
      entry => !entry.url.includes('*') && !isEditorialSitemapPath(entry.url)
    )
    .filter(entry =>
      entry.recipeId ? COMMERCIAL_RECIPES.has(entry.recipeId) : true
    )
    .map(entry => entry.url);
}

export function collectSitemapInventoryViolations(
  entries: readonly SitemapInventoryEntry[],
  options: {
    readonly generatedAt?: Date;
    readonly manifest?: readonly SitemapManifestRoute[];
  } = {}
): string[] {
  const manifest = options.manifest ?? MARKETING_ROUTE_MANIFEST;
  const violations: string[] = [];
  const paths = entries.map(entry => sitemapPathname(entry.url));
  const pathSet = new Set(paths);

  for (const hub of getPublishedCommercialHubPaths(manifest)) {
    if (!pathSet.has(hub)) violations.push(`omitted commercial page: ${hub}`);
  }

  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const path = paths[index] ?? '/';
    if (!entry.url.startsWith('https://jov.ie')) {
      violations.push(`non-canonical url: ${entry.url}`);
    }
    if (!seen.add(path)) violations.push(`duplicate sitemap url: ${path}`);
    if (manifest.some(route => route.url === path && route.aliasOf)) {
      violations.push(`alias included: ${path}`);
    }
    if (
      AUTH_PRIVATE_PATHS.has(path) ||
      path === '/renders' ||
      path.startsWith('/renders/')
    ) {
      violations.push(`private or fixture url included: ${path}`);
    }
    const lastmod = toContentRevisionDate(entry.lastModified);
    if (
      options.generatedAt &&
      lastmod?.getTime() === options.generatedAt.getTime()
    ) {
      violations.push(`request-time lastmod on unchanged page: ${path}`);
    }
    const handle = path.split('/').filter(Boolean)[0];
    if (handle && isOpaqueInternalProfileHandle(handle)) {
      violations.push(`QA identity included: ${path}`);
    }
  }

  return violations;
}
