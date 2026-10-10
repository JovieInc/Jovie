import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { resolveMarketingPageContract } from '@/data/marketing/factory/pageRecordContract';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { MARKETING_CUSTOMERS_FLYOUT } from '@/data/marketingNavigation';
import { getPublicProfileCandidate } from '@/lib/routing/proxy-routing';
import { classifySurface } from '@/lib/seo/page-certification';
import { isReservedUsername } from '@/lib/validation/username-core';
import { importNextConfig } from '../../lib/next-config-import';

describe('/solutions/artists artist solution route (JOV-5861)', () => {
  it('binds the route to the artist-lp recipe in the manifest', () => {
    expect(APP_ROUTES.SOLUTIONS_ARTISTS).toBe('/solutions/artists');
    const entry = MARKETING_ROUTE_MANIFEST.find(
      candidate =>
        candidate.glob === '(marketing)/solutions/[audience]/page.tsx'
    );
    expect(entry).toBeDefined();
    expect(entry?.recipeId).toBe('artist-lp');
    expect(entry?.status).toBe('active');
    expect(entry?.url).toBe('/solutions/*');
    expect(entry?.healthCheck?.path).toBe('/solutions/artists');
    expect(entry?.aliasOf).toBeUndefined();
  });

  it('keeps the artist solution scoped to music language with claim-profile CTA', () => {
    const contract = resolveMarketingPageContract('/solutions/artists');
    expect(contract?.copyScope).toBe('music');
    expect(contract?.primaryCta.href).toBe(APP_ROUTES.SIGNUP);
  });

  it('is reachable from the published Customers flyout as an ordinary link', () => {
    const artistsLink = MARKETING_CUSTOMERS_FLYOUT.links.find(
      link => link.label === 'Artists'
    );
    expect(artistsLink?.href).toBe('/solutions/artists');
  });

  it('does not repurpose the /artists directory as the solution page', () => {
    const directoryEntry = MARKETING_ROUTE_MANIFEST.find(
      candidate => candidate.url === '/artists'
    );
    expect(directoryEntry?.recipeId).not.toBe('artist-lp');
  });
});

describe('bare /solutions root (JOV-7230)', () => {
  it('redirects /solutions to the shipped /solutions/artists page', async () => {
    const nextConfigModule = await importNextConfig();
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as {
      source: string;
      destination: string;
      permanent: boolean;
    }[];

    expect(
      redirects.find(redirect => redirect.source === '/solutions')
    ).toEqual({
      source: '/solutions',
      destination: APP_ROUTES.SOLUTIONS_ARTISTS,
      permanent: true,
    });
  });

  it('never resolves /solutions as a public profile handle', () => {
    expect(isReservedUsername('solutions')).toBe(true);
    expect(getPublicProfileCandidate('/solutions')).toBeNull();
  });

  it('keeps /solutions/artists classified as a marketing surface', () => {
    expect(classifySurface('/solutions/artists')).toBe('marketing');
  });
});
