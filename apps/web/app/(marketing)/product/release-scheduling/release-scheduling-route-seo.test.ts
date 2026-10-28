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

describe('/product/release-scheduling marketing route', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain(
      '/product/release-scheduling'
    );
    expect(getPublishedCommercialHubPaths()).not.toContain(
      '/product/release-scheduling'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/release-scheduling'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/artist-profiles',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/release-scheduling',
      expected: 'redirect',
      allowedFinalPaths: ['/artist-profiles'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/release-scheduling')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/release-scheduling')
    ).toBe(false);
  });
});
