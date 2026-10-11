import { describe, expect, it } from 'vitest';
import { resolveMarketingHeaderPrimaryCta } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
import { MARKETING_PAGE_CONTRACTS } from '@/data/marketing/pageContracts';

/**
 * JOV-6860: the marketing header's primary CTA label must come from the one
 * waitlist-mode front-door source on every route. Per-route divergence (the
 * artist-profiles "Get started" drift) fails here. The homepage "Find
 * yourself" → /start lock (JOV-5085) is the only sanctioned override.
 */
const HEADER_MANIFEST_ROUTES = Object.values(MARKETING_PAGE_CONTRACTS)
  .map(contract => contract.url)
  .filter(url => !url.endsWith('/*'));

describe('marketing header CTA consistency', () => {
  for (const waitlistEnabled of [true, false]) {
    it(`resolves one shared primary CTA across the route manifest (waitlist=${waitlistEnabled})`, () => {
      const shared = getHomepageFrontDoorCtaContract(waitlistEnabled).primary;
      const divergent = HEADER_MANIFEST_ROUTES.filter(
        url => url !== APP_ROUTES.HOME
      ).filter(
        url =>
          resolveMarketingHeaderPrimaryCta(url, waitlistEnabled).label !==
          shared.label
      );

      expect(divergent).toEqual([]);
      for (const url of HEADER_MANIFEST_ROUTES) {
        if (url === APP_ROUTES.HOME) continue;
        expect(
          resolveMarketingHeaderPrimaryCta(url, waitlistEnabled),
          `${url} header CTA`
        ).toEqual(shared);
      }
    });
  }

  it('keeps the locked homepage Find yourself → /start CTA in both modes', () => {
    for (const waitlistEnabled of [true, false]) {
      expect(
        resolveMarketingHeaderPrimaryCta(APP_ROUTES.HOME, waitlistEnabled)
      ).toEqual({ label: 'Find yourself', href: APP_ROUTES.START });
    }
  });

  it('keeps artist-profiles on the shared waitlist CTA', () => {
    expect(
      resolveMarketingHeaderPrimaryCta(APP_ROUTES.ARTIST_PROFILES, true)
    ).toEqual({ label: 'Request access', href: APP_ROUTES.SIGNUP });
    expect(
      resolveMarketingHeaderPrimaryCta(APP_ROUTES.ARTIST_PROFILE_LEGACY, true)
    ).toEqual({ label: 'Request access', href: APP_ROUTES.SIGNUP });
  });
});
