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

describe('/product/isrc marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_ISRC).toBe('/product/isrc');
    expect(getExactPublishedMarketingPaths()).toContain('/product/isrc');
    expect(getPublishedCommercialHubPaths()).toContain('/product/isrc');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/isrc'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/isrc/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/isrc',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'isrc-editor',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/isrc')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/isrc')).toBe(false);
  });
});
