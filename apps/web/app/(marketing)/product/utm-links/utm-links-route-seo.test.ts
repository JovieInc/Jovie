import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  getPublicProfileCandidate,
  isPublicProfileAudienceBlockCandidate,
} from '@/lib/routing/proxy-routing';
import {
  getExactPublishedMarketingPaths,
  getPublishedCommercialHubPaths,
} from '@/lib/seo/sitemap-publication';

describe('/product/utm-links marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_UTM_LINKS).toBe('/product/utm-links');
    expect(getExactPublishedMarketingPaths()).toContain('/product/utm-links');
    expect(getPublishedCommercialHubPaths()).toContain('/product/utm-links');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/utm-links'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/utm-links/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/utm-links',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'utm-builder',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/utm-links')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/utm-links')).toBe(
      false
    );
  });
});
