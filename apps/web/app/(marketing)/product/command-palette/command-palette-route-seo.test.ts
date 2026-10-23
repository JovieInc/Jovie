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

describe('/product/command-palette marketing route', () => {
  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_COMMAND_PALETTE).toBe('/product/command-palette');
    expect(getExactPublishedMarketingPaths()).toContain(
      '/product/command-palette'
    );
    expect(getPublishedCommercialHubPaths()).toContain(
      '/product/command-palette'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/command-palette'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/command-palette/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/command-palette',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'shared-command-palette',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/command-palette')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/command-palette')
    ).toBe(false);
  });
});
