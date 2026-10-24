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

describe('/product/link-analytics marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_LINK_ANALYTICS).toBe('/product/link-analytics');
    expect(getExactPublishedMarketingPaths()).toContain(
      '/product/link-analytics'
    );
    expect(getPublishedCommercialHubPaths()).toContain(
      '/product/link-analytics'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/link-analytics'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/link-analytics/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/link-analytics',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'release-smart-link-analytics',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/link-analytics')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/link-analytics')
    ).toBe(false);
  });
});
