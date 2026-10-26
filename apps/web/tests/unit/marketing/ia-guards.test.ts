import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTE_CAPABILITY_BINDINGS } from '@/data/marketing/featureAvailability';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  getMarketingFooterColumns,
  MARKETING_CUSTOMERS_FLYOUT,
  MARKETING_FOOTER_COLUMNS,
  MARKETING_NAV_LINKS,
  MARKETING_TOOLS_FLYOUT_LINKS,
  PUBLIC_COMMERCIAL_FOOTER_LINKS,
} from '@/data/marketingNavigation';
import { getProductCapability } from '@/data/product-truth/registry';
import { robotsForRoute } from '@/lib/marketing/route-publication-policy';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { PUBLIC_URL_POLICY } from '@/lib/seo/public-url-policy';
import {
  collectSitemapInventoryViolations,
  getExactPublishedMarketingPaths,
} from '@/lib/seo/sitemap-publication';

const webRoot = path.resolve(__dirname, '../../..');

/** Pages that exist but are not launched: unlisted, noindex, off nav and sitemap. */
const UNLISTED_ROUTES = [
  '/pay',
  '/instant-merch',
  '/youtube-thumbnails',
  '/voice',
  '/card',
] as const;

const REDIRECTED_ROUTES = PUBLIC_URL_POLICY.filter(
  entry => entry.action === 'redirect'
).map(entry => entry.path);

function allNavHrefs(): string[] {
  return [
    ...MARKETING_NAV_LINKS,
    ...MARKETING_CUSTOMERS_FLYOUT.links,
    ...MARKETING_TOOLS_FLYOUT_LINKS,
    ...PUBLIC_COMMERCIAL_FOOTER_LINKS,
    ...MARKETING_FOOTER_COLUMNS.flatMap(column => column.links),
    ...getMarketingFooterColumns(true).flatMap(column => column.links),
  ].map(link => link.href.split(/[?#]/u)[0] ?? link.href);
}

describe('marketing IA guards (phase 1)', () => {
  it('every manifest redirect has a matching 308 in the public URL policy', () => {
    const redirects = MARKETING_ROUTE_MANIFEST.filter(
      entry =>
        entry.healthCheck?.expected === 'redirect' &&
        entry.aliasOf !== undefined &&
        !entry.url.includes('*') &&
        entry.url !== '/artist-profile' // legacy 301 lives in next.config only
    );
    expect(redirects.length).toBeGreaterThan(0);
    for (const entry of redirects) {
      const policy = PUBLIC_URL_POLICY.find(row => row.path === entry.url);
      expect(policy, entry.url).toMatchObject({
        action: 'redirect',
        status: 308,
        destination: entry.aliasOf,
      });
    }
  });

  it('no header or footer link points at a redirected or unlisted route', () => {
    const hrefs = new Set(allNavHrefs());
    for (const route of [
      ...REDIRECTED_ROUTES,
      ...UNLISTED_ROUTES,
      '/ai',
      '/engineering',
    ]) {
      expect(hrefs.has(route), route).toBe(false);
    }
  });

  it('unlisted routes are noindex by capability and off the sitemap', () => {
    const listed = new Set(getExactPublishedMarketingPaths());
    for (const route of UNLISTED_ROUTES) {
      expect(robotsForRoute(route), route).toEqual(NOINDEX_ROBOTS);
      expect(listed.has(route), route).toBe(false);
    }
    for (const route of [...UNLISTED_ROUTES, '/ai']) {
      const source = readFileSync(
        path.join(webRoot, `app/(marketing)${route}/page.tsx`),
        'utf8'
      );
      expect(source, route).toMatch(/robotsForRoute\(|NOINDEX_ROBOTS/u);
    }
  });

  it('the sitemap refuses any page whose capability is not GA and public', () => {
    const listed = new Set(getExactPublishedMarketingPaths());
    for (const [route, capabilityId] of Object.entries(
      ROUTE_CAPABILITY_BINDINGS
    )) {
      const capability = getProductCapability(capabilityId);
      const ga =
        capability?.maturity === 'general_availability' &&
        capability.publication === 'public';
      if (!ga)
        expect(listed.has(route), `${route} (${capabilityId})`).toBe(false);
      const violations = collectSitemapInventoryViolations([
        { url: `https://jov.ie${route}` },
      ]);
      expect(
        violations.some(violation =>
          violation.startsWith('non-GA capability url')
        ),
        route
      ).toBe(!ga);
    }
  });

  it('keeps redirected IA duplicates out of the sitemap generator output', () => {
    const listed = new Set(getExactPublishedMarketingPaths());
    for (const route of REDIRECTED_ROUTES) {
      expect(listed.has(route), route).toBe(false);
    }
  });
});
