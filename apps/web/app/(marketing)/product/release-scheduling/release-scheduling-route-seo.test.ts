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

describe('/product/release-scheduling marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_RELEASE_SCHEDULING).toBe(
      '/product/release-scheduling'
    );
    expect(getExactPublishedMarketingPaths()).toContain(
      '/product/release-scheduling'
    );
    expect(getPublishedCommercialHubPaths()).toContain(
      '/product/release-scheduling'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/release-scheduling'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/release-scheduling/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/release-scheduling',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'release-schedule-fields',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/release-scheduling')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/release-scheduling')
    ).toBe(false);
  });
});
