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

describe('/product/command-palette marketing route', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain(
      '/product/command-palette'
    );
    expect(getPublishedCommercialHubPaths()).not.toContain(
      '/product/command-palette'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/command-palette'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/command-palette',
      expected: 'redirect',
      allowedFinalPaths: ['/'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/command-palette')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/command-palette')
    ).toBe(false);
  });
});
