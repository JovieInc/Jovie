import { readFileSync } from 'node:fs';
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

describe('/product/traffic-quality marketing route', () => {
  it('inherits static defaults without legacy route-segment cache exports', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /\bexport\s+const\s+(?:dynamic|fetchCache|revalidate)\s*=/
    );
  });

  it('ships as a published commercial sitemap hub', () => {
    expect(APP_ROUTES.PRODUCT_TRAFFIC_QUALITY).toBe('/product/traffic-quality');
    expect(getExactPublishedMarketingPaths()).toContain(
      '/product/traffic-quality'
    );
    expect(getPublishedCommercialHubPaths()).toContain(
      '/product/traffic-quality'
    );

    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/product/traffic-quality'
    );
    expect(route).toMatchObject({
      status: 'active',
      recipeId: 'feature',
      glob: '(marketing)/product/traffic-quality/page.tsx',
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
    expect(route?.healthCheck).toMatchObject({
      path: '/product/traffic-quality',
      expected: 'page',
    });
    expect(route?.productEvidence).toMatchObject({
      kind: 'interactive-mockup',
      testId: 'traffic-quality-filter',
    });
  });

  it('is not a public profile path', () => {
    expect(getPublicProfileCandidate('/product/traffic-quality')).toBeNull();
    expect(
      isPublicProfileAudienceBlockCandidate('/product/traffic-quality')
    ).toBe(false);
  });
});
