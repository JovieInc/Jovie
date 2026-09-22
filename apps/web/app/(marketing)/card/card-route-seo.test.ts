import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  getPublicProfileCandidate,
  isDedicatedRootSegment,
  isPublicProfileAudienceBlockCandidate,
} from '@/lib/routing/proxy-routing';
import {
  getExactPublishedMarketingPaths,
  getPublishedCommercialHubPaths,
} from '@/lib/seo/sitemap-publication';
import { isReservedUsername } from '@/lib/validation/username-core';
import { metadata } from './page';

describe('/card marketing route', () => {
  it('publishes one canonical feature-page route', () => {
    expect(APP_ROUTES.CARD).toBe('/card');
    expect(getExactPublishedMarketingPaths()).toContain('/card');
    expect(getPublishedCommercialHubPaths()).toContain('/card');

    const route = MARKETING_ROUTE_MANIFEST.find(entry => entry.url === '/card');
    expect(route).toMatchObject({
      glob: '(marketing)/card/page.tsx',
      status: 'active',
      recipeId: 'feature',
      healthCheck: {
        path: '/card',
        expected: 'page',
        waitFor: '[data-testid="marketing-section-hero"]',
      },
    });
    expect(route?.noindex).toBeUndefined();
    expect(route?.aliasOf).toBeUndefined();
  });

  it('reserves card for the dedicated route instead of treating it as a profile', () => {
    expect(isReservedUsername('card')).toBe(true);
    expect(isDedicatedRootSegment('card')).toBe(true);
    expect(getPublicProfileCandidate('/card')).toBeNull();
    expect(isPublicProfileAudienceBlockCandidate('/card')).toBe(false);
  });

  it('keeps canonical, social, and coming-soon metadata on the same route', () => {
    expect(metadata.alternates?.canonical).toBe('https://jov.ie/card');
    expect(metadata.description).toContain('coming to Apple Wallet');
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: 'https://jov.ie/card',
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(metadata.robots).toBeUndefined();
  });
});
