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

describe('/product/isrc marketing route', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain('/product/isrc');
    expect(getPublishedCommercialHubPaths()).not.toContain('/product/isrc');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/isrc'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/smart-links',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/isrc',
      expected: 'redirect',
      allowedFinalPaths: ['/smart-links'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/isrc')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/isrc')).toBe(false);
  });
});
