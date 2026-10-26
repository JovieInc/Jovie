import { describe, expect, it } from 'vitest';
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
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain(
      '/product/link-analytics'
    );
    expect(getPublishedCommercialHubPaths()).not.toContain(
      '/product/link-analytics'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/link-analytics'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/smart-links',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/link-analytics',
      expected: 'redirect',
      allowedFinalPaths: ['/smart-links'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/link-analytics')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/link-analytics')
    ).toBe(false);
  });
});
