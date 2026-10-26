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

describe('/product/pre-save marketing route', () => {
  it('is redirected out of the sitemap (phase 1 IA)', () => {
    expect(getExactPublishedMarketingPaths()).not.toContain(
      '/product/pre-save'
    );
    expect(getPublishedCommercialHubPaths()).not.toContain('/product/pre-save');

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/pre-save'
    );
    expect(route).toMatchObject({
      status: 'deprecated',
      aliasOf: '/smart-links',
      noindex: true,
    });
    expect(route?.healthCheck).toMatchObject({
      path: '/product/pre-save',
      expected: 'redirect',
      allowedFinalPaths: ['/smart-links'],
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/pre-save')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/product/pre-save')).toBe(
      false
    );
  });
});
