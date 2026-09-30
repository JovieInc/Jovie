import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOUNDED_MARKETING_REVENUE_PATH,
  type BoundedRevenuePathStop,
  isBoundedRevenuePathHref,
} from '@/data/marketing/boundedRevenuePath';
import {
  isIndexableCapabilityPath,
  isNavigationEligiblePath,
} from '@/data/marketing/featureAvailability';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import {
  MARKETING_CUSTOMERS_FLYOUT,
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
} from '@/data/marketingNavigation';

/**
 * Acceptable-to-sell gate for the bounded marketing revenue path (JOV-7329).
 *
 * Fails closed: a regression on any bounded stop — missing page file, inactive
 * or missing manifest binding, a route that drops out of navigation/indexing
 * eligibility, a header link or CTA that escapes the certified path — fails
 * this suite. Routes outside the bounded path are untouched, so unrelated
 * certification debt never freezes this gate and vice versa.
 */

const APP_ROOT = join(process.cwd(), 'app');

const manifestEntryFor = (stop: BoundedRevenuePathStop) =>
  MARKETING_ROUTE_MANIFEST.find(
    entry =>
      entry.url === stop.url ||
      (entry.url?.endsWith('/*') === true &&
        stop.url.startsWith(entry.url.slice(0, -1)))
  );

const headerSurfaceLinks = [
  ...MARKETING_NAV_LINKS,
  ...MARKETING_CUSTOMERS_FLYOUT.links,
  ...MARKETING_NAV_UTILITIES,
];

const ctaHrefs = [
  MARKETING_CTA_INTENTS.claimProfile.href,
  MARKETING_CTA_INTENTS.seeLiveProfile.href,
];

describe('bounded marketing revenue path (JOV-7329)', () => {
  it('declares at least one stop per role in the funnel', () => {
    const roles = new Set(BOUNDED_MARKETING_REVENUE_PATH.map(s => s.role));
    for (const role of ['landing', 'understanding', 'offer', 'handoff']) {
      expect(roles.has(role as never), `missing role ${role}`).toBe(true);
    }
  });

  it.each(
    BOUNDED_MARKETING_REVENUE_PATH.map(stop => [stop.url, stop] as const)
  )('stop %s has at least one real page file', (_url, stop) => {
    const found = stop.pageGlobs.filter(glob =>
      existsSync(join(APP_ROOT, glob))
    );
    expect(
      found,
      `no page file for ${stop.url} (checked: ${stop.pageGlobs.join(', ')})`
    ).not.toHaveLength(0);
  });

  it.each(
    BOUNDED_MARKETING_REVENUE_PATH.filter(s => s.role !== 'handoff').map(
      stop => [stop.url, stop] as const
    )
  )(
    'marketing stop %s is an active manifest route, navigable and indexable',
    (_url, stop) => {
      const entry = manifestEntryFor(stop);
      expect(
        entry,
        `${stop.url} missing from MARKETING_ROUTE_MANIFEST`
      ).toBeDefined();
      expect(entry?.status).toBe('active');
      expect(isNavigationEligiblePath(stop.url)).toBe(true);
      expect(isIndexableCapabilityPath(stop.url)).toBe(true);
    }
  );

  it('every header navigation link stays on the bounded path', () => {
    const offPath = headerSurfaceLinks
      .filter(link => !isBoundedRevenuePathHref(link.href))
      .map(link => link.href);
    expect(offPath).toEqual([]);
  });

  it('every CTA intent resolves to a bounded stop', () => {
    const offPath = ctaHrefs.filter(href => !isBoundedRevenuePathHref(href));
    expect(offPath).toEqual([]);
  });

  it('every bounded stop is reachable from navigation or a CTA intent', () => {
    const reachable = new Set(
      [...headerSurfaceLinks.map(l => l.href), ...ctaHrefs].map(
        href => href.split('#')[0]?.split('?')[0]
      )
    );
    const orphans = BOUNDED_MARKETING_REVENUE_PATH.filter(
      stop => !reachable.has(stop.url) && stop.url !== '/'
    ).map(stop => stop.url);
    expect(orphans).toEqual([]);
  });
});
