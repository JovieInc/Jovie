import { describe, expect, it } from 'vitest';
import { resolveMarketingHeaderPrimaryCta } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
import { MARKETING_PAGE_CONTRACTS } from '@/data/marketing/pageContracts';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';

/**
 * JOV-6860: the marketing header's primary CTA label must come from the one
 * front-door source on every route. Per-route divergence (the
 * artist-profiles "Get started" drift) fails here. The homepage claim
 * → /start lock (JOV-5085) is the only sanctioned override.
 */
const HEADER_MANIFEST_ROUTES = Object.values(MARKETING_PAGE_CONTRACTS)
  .map(contract => contract.url)
  .filter(url => !url.endsWith('/*'));

describe('marketing header CTA consistency', () => {
  it('resolves one shared primary CTA across the route manifest', () => {
    const shared = getHomepageFrontDoorCtaContract().primary;
    const divergent = HEADER_MANIFEST_ROUTES.filter(
      url => url !== APP_ROUTES.HOME
    ).filter(
      url => resolveMarketingHeaderPrimaryCta(url).label !== shared.label
    );

    expect(divergent).toEqual([]);
    for (const url of HEADER_MANIFEST_ROUTES) {
      if (url === APP_ROUTES.HOME) continue;
      expect(
        resolveMarketingHeaderPrimaryCta(url),
        `${url} header CTA`
      ).toEqual(shared);
    }
  });

  it('keeps the homepage header on the claim-profile action', () => {
    // Tim, 2026-11-12: "Switch it". The homepage header enters /start with
    // the shared claim-profile intent, like the hero and the close.
    const claim = getClaimProfileIntent();
    expect(resolveMarketingHeaderPrimaryCta(APP_ROUTES.HOME)).toEqual({
      label: claim.label,
      href: claim.href,
    });
  });

  it('keeps artist-profiles on the shared open-signup CTA', () => {
    const open = { label: 'Claim your free profile', href: APP_ROUTES.START };
    expect(
      resolveMarketingHeaderPrimaryCta(APP_ROUTES.ARTIST_PROFILES)
    ).toEqual(open);
    expect(
      resolveMarketingHeaderPrimaryCta(APP_ROUTES.ARTIST_PROFILE_LEGACY)
    ).toEqual(open);
  });
});
