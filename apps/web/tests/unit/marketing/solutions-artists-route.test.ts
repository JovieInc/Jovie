import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getMarketingPageContractForPathname } from '@/data/marketing/pageContracts';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { MARKETING_FOR_FLYOUT_LINKS } from '@/data/marketingNavigation';

describe('/solutions/artists artist solution route (JOV-5861)', () => {
  it('binds the route to the artist-lp recipe in the manifest', () => {
    expect(APP_ROUTES.SOLUTIONS_ARTISTS).toBe('/solutions/artists');
    const entry = MARKETING_ROUTE_MANIFEST.find(
      candidate => candidate.glob === '(marketing)/solutions/artists/page.tsx'
    );
    expect(entry).toBeDefined();
    expect(entry?.recipeId).toBe('artist-lp');
    expect(entry?.status).toBe('active');
    expect(entry?.url).toBe('/solutions/artists');
    expect(entry?.aliasOf).toBeUndefined();
  });

  it('keeps the artist solution scoped to music language with claim-profile CTA', () => {
    const contract = getMarketingPageContractForPathname('/solutions/artists');
    expect(contract?.copyScope).toBe('music');
    expect(contract?.primaryCta.href).toBe(APP_ROUTES.SIGNUP);
  });

  it('is reachable from the published Solutions flyout as an ordinary link', () => {
    const artistsLink = MARKETING_FOR_FLYOUT_LINKS.find(
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
