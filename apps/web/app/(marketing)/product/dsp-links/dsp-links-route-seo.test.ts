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

describe('/product/dsp-links marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_DSP_LINKS).toBe('/product/dsp-links');
    expect(getExactPublishedMarketingPaths()).toContain('/product/dsp-links');
    expect(getPublishedCommercialHubPaths()).toContain('/product/dsp-links');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/dsp-links'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/dsp-links/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/dsp-links',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'dsp-links',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/dsp-links')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/dsp-links')).toBe(
      false
    );
  });
});
