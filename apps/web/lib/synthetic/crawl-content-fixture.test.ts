import { describe, expect, it } from 'vitest';
import { getMerchCardSellability } from '@/lib/merch/safety';
import {
  getPublicProfileIdentityExclusionReason,
  isReservedPublicProfileIdentity,
} from '@/lib/profile/public-profile-identity-policy';
import { getPublicProfileRobots } from '@/lib/profile/public-profile-indexing-policy';
import {
  isTestProfile,
  shouldHideTestProfileFromDirectUrl,
} from '@/lib/profile/test-profile-policy';
import {
  buildCrawlFixtureMerchSnapshots,
  CRAWL_CONTENT_FIXTURE,
  CrawlContentFixtureGuardError,
  type CrawlContentObservedState,
  crawlContentFixturePaths,
  parseCrawlContentFixture,
  planCrawlContentFixture,
} from './crawl-content-fixture';

const empty: CrawlContentObservedState = {
  user: null,
  profile: null,
  claimUserId: null,
  release: null,
  releaseApproved: false,
  releaseProviderLink: false,
  promoDownload: null,
  merchCard: null,
  assetShareVisibility: null,
};

const converged: CrawlContentObservedState = {
  user: { id: 'u1' },
  profile: { id: 'p1', userId: 'u1', isPublic: true, isClaimed: true },
  claimUserId: 'u1',
  release: { creatorProfileId: 'p1' },
  releaseApproved: true,
  releaseProviderLink: true,
  promoDownload: { creatorProfileId: 'p1', isActive: true },
  merchCard: { creatorProfileId: 'p1', status: 'live' },
  assetShareVisibility: 'public',
};

describe('crawl content fixture', () => {
  it('names the three pages the crawl could not reach', () => {
    const f = CRAWL_CONTENT_FIXTURE;
    expect(crawlContentFixturePaths()).toEqual({
      download: `/${f.handle}/${f.release.slug}/download`,
      merch: `/${f.handle}/merch/${f.merchCard.id}`,
      assetShare: `/a/${f.handle}/${f.release.slug}`,
    });
  });

  it('rejects a spec that is not a harness identity', () => {
    expect(() =>
      parseCrawlContentFixture({
        ...CRAWL_CONTENT_FIXTURE,
        email: 'someone@gmail.com',
      })
    ).toThrow(/harness address/);
    expect(() =>
      parseCrawlContentFixture({
        ...CRAWL_CONTENT_FIXTURE,
        merchCard: { id: 'nope', title: 'x' },
      })
    ).toThrow(/merchCard.id must be a uuid/);
  });

  it('stays hidden: reserved, noindex, test-owned, viewable by URL only', () => {
    const { handle, email } = CRAWL_CONTENT_FIXTURE;
    expect(getPublicProfileIdentityExclusionReason(handle)).toBe(
      'crawl_content_fixture'
    );
    expect(isReservedPublicProfileIdentity(handle)).toBe(true);
    expect(getPublicProfileRobots(handle)).toMatchObject({ index: false });
    expect(isTestProfile({ ownerEmail: email })).toBe(true);
    expect(
      shouldHideTestProfileFromDirectUrl({ handle, ownerEmail: email })
    ).toBe(false);
  });

  it('plans every row on an empty database', () => {
    expect(
      planCrawlContentFixture(empty).map(s => `${s.name}:${s.action}`)
    ).toEqual([
      'user:create',
      'profile:create',
      'claim:create',
      'release:create',
      'release-approval:create',
      'release-provider-link:create',
      'promo-download:create',
      'merch-card:create',
      'asset-share:create',
    ]);
  });

  it('has nothing to do once converged', () => {
    expect(
      planCrawlContentFixture(converged).every(s => s.action === 'none')
    ).toBe(true);
  });

  it('converges rows that drifted from what the pages need', () => {
    const drifted = {
      ...converged,
      merchCard: { creatorProfileId: 'p1', status: 'paused' },
      assetShareVisibility: 'private' as const,
    };
    const changed = planCrawlContentFixture(drifted)
      .filter(s => s.action !== 'none')
      .map(s => s.name);
    expect(changed).toEqual(['merch-card', 'asset-share']);
  });

  it('refuses a handle owned or claimed by someone else', () => {
    expect(() =>
      planCrawlContentFixture({
        ...empty,
        profile: { id: 'p9', userId: 'other', isPublic: true, isClaimed: true },
      })
    ).toThrow(CrawlContentFixtureGuardError);
    expect(() =>
      planCrawlContentFixture({ ...converged, claimUserId: 'other' })
    ).toThrow(CrawlContentFixtureGuardError);
  });

  it('refuses a fixed id that belongs to another profile', () => {
    expect(() =>
      planCrawlContentFixture({
        ...converged,
        merchCard: { creatorProfileId: 'p9', status: 'live' },
      })
    ).toThrow(/merch card id already belongs to another profile/);
  });
});

describe('crawl fixture merch card', () => {
  it('renders but can never be bought', () => {
    const { printful, pricing } = buildCrawlFixtureMerchSnapshots();
    const result = getMerchCardSellability({
      currency: 'USD',
      retailPriceCents: pricing.retailPriceCents,
      estimatedPrintfulProductCostCents: 0,
      artistRoyaltyRateBps: 0,
      pricing,
      primaryImageUrl: '/images/demo/artwork-2.png',
      mockupUrls: ['/images/demo/artwork-2.png'],
      printful,
      qualityReview: null,
    });
    expect(result.sellable).toBe(false);
    expect(result.reasons).toContain('Missing print files.');
    expect(Object.keys(printful.variantMap)).toHaveLength(1);
  });
});
