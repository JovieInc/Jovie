import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  getPublicProfileCandidate,
  isDedicatedRootSegment,
  isPublicProfileAudienceBlockCandidate,
} from '@/lib/routing/proxy-routing';
import {
  getExactPublishedMarketingPaths,
  getPublishedCommercialHubPaths,
} from '@/lib/seo/sitemap-publication';
import { isReservedUsername } from '@/lib/validation/username-core';

describe('/product live marketing route (DESIGN_READY 2026-09-17)', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain('/product');
    expect(getPublishedCommercialHubPaths()).not.toContain('/product');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product',
      expected: 'redirect',
      allowedFinalPaths: ['/'],
    });
  });

  it('is a dedicated marketing root, not a username miss or reserved-gone handle', () => {
    expect(isDedicatedRootSegment('product')).toBe(true);
    expect(getPublicProfileCandidate('/product')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product')).toBe(false);
    // Do not reserve `product` as a 410/gone handle. #17948 keeps it
    // unreserved; APP_ROUTES.PRODUCT is the dedicated-route pin.
    expect(isReservedUsername('product')).toBe(false);
  });
});
