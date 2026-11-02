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

describe('/product/pre-save marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_PRE_SAVE).toBe('/product/pre-save');
    expect(getExactPublishedMarketingPaths()).toContain('/product/pre-save');
    expect(getPublishedCommercialHubPaths()).toContain('/product/pre-save');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/pre-save'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/pre-save/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/pre-save',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'pre-save-countdown',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/pre-save')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/pre-save')).toBe(
      false
    );
  });
});
