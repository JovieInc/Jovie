import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
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
  it('ships as a published commercial sitemap hub, not a gone URL', () => {
    expect(APP_ROUTES.PRODUCT).toBe('/product');
    expect(getExactPublishedMarketingPaths()).toContain('/product');
    expect(getPublishedCommercialHubPaths()).toContain('/product');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product',
      expected: 'page',
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
