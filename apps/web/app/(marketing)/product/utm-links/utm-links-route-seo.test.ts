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

describe('/product/utm-links marketing route', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain(
      '/product/utm-links'
    );
    expect(getPublishedCommercialHubPaths()).not.toContain(
      '/product/utm-links'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/utm-links'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/smart-links',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/utm-links',
      expected: 'redirect',
      allowedFinalPaths: ['/smart-links'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/utm-links')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/utm-links')).toBe(
      false
    );
  });
});
