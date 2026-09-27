import { describe, expect, it } from 'vitest';
import {
  describeFeatureAccess,
  FEATURE_MATURITY_STATES,
  type FeatureCapabilityRecord,
  getCapabilityRecord,
  getRouteCapability,
  isCapabilityIndexable,
  isCapabilityNavigable,
  isCapabilityPurchasable,
  isFeatureUsable,
  isIndexableCapabilityPath,
  isInterestCaptureOnly,
  isNavigationEligiblePath,
  isPublicationPermitted,
  MARKETING_FEATURE_CAPABILITIES,
  ROUTE_CAPABILITY_BINDINGS,
  resolvePostExperimentAccess,
} from '@/data/marketing/featureAvailability';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_NAV_LINKS,
} from '@/data/marketingNavigation';
import {
  isNavigableRoute,
  resolveMarketingRoutePolicy,
} from '@/lib/marketing/route-publication-policy';
import { isSitemapIndexableMarketingRoute } from '@/lib/seo/sitemap-publication';

const record = (
  overrides: Partial<FeatureCapabilityRecord>
): FeatureCapabilityRecord => ({
  capabilityId: 'fixture',
  maturity: 'general_availability',
  publication: 'public',
  access: 'open',
  audience: 'general',
  supportedJobs: ['fixture job'],
  proofAuthorized: true,
  contentRevision: '2026-09-01',
  ...overrides,
});

describe('feature availability contract — maturity states', () => {
  it('declares all four maturity states', () => {
    expect(FEATURE_MATURITY_STATES).toEqual([
      'proposed',
      'limited_testing',
      'public_beta',
      'general_availability',
    ]);
  });

  it.each(FEATURE_MATURITY_STATES)('covers %s without throwing', maturity => {
    const r = record({ maturity });
    expect(typeof isFeatureUsable(r)).toBe('boolean');
    expect(typeof isCapabilityPurchasable(r)).toBe('boolean');
    expect(typeof describeFeatureAccess(r)).toBe('string');
  });

  it('proposed is never usable even when published', () => {
    const r = record({ maturity: 'proposed', access: 'interest_capture' });
    expect(isPublicationPermitted(r)).toBe(true);
    expect(isFeatureUsable(r)).toBe(false);
    expect(isInterestCaptureOnly(r)).toBe(true);
    expect(isCapabilityPurchasable(r)).toBe(false);
  });

  it('a proposed feature cannot become available via experiment success', () => {
    const r = record({ maturity: 'proposed', access: 'interest_capture' });
    expect(resolvePostExperimentAccess(r, true)).toBe('interest_capture');
    expect(
      resolvePostExperimentAccess(record({ maturity: 'proposed' }), true)
    ).toBe('unavailable');
  });

  it('experiment success may enroll a non-proposed unavailable feature', () => {
    const r = record({ maturity: 'limited_testing', access: 'unavailable' });
    expect(resolvePostExperimentAccess(r, true)).toBe('enrolled');
    expect(resolvePostExperimentAccess(r, false)).toBe('unavailable');
  });
});

describe('feature availability contract — distinct decisions', () => {
  it('publication, access, pricing, and indexing are separable', () => {
    const demandValidation = record({
      maturity: 'proposed',
      access: 'interest_capture',
      accessLabel: 'Planned — join the list.',
    });
    // Published and indexable while the feature itself is unavailable.
    expect(isPublicationPermitted(demandValidation)).toBe(true);
    expect(isCapabilityIndexable(demandValidation)).toBe(true);
    expect(isFeatureUsable(demandValidation)).toBe(false);
    expect(isCapabilityPurchasable(demandValidation)).toBe(false);
    expect(describeFeatureAccess(demandValidation)).toBe(
      'Planned — join the list.'
    );
  });

  it('unlisted publication is renderable but not indexable', () => {
    const r = record({ publication: 'unlisted' });
    expect(isPublicationPermitted(r)).toBe(true);
    expect(isCapabilityIndexable(r)).toBe(false);
    expect(isCapabilityNavigable(r)).toBe(true);
  });

  it('internal_only never surfaces publicly', () => {
    const r = record({ publication: 'internal_only' });
    expect(isPublicationPermitted(r)).toBe(false);
    expect(isCapabilityIndexable(r)).toBe(false);
    expect(isCapabilityNavigable(r)).toBe(false);
  });

  it('unauthorized proof blocks indexing, navigation, and machine outputs', () => {
    const r = record({ proofAuthorized: false });
    expect(isCapabilityIndexable(r)).toBe(false);
    expect(isCapabilityNavigable(r)).toBe(false);
  });

  it('purchasable requires a canonical offer and real access', () => {
    expect(isCapabilityPurchasable(record({}))).toBe(false); // no offerId
    expect(
      isCapabilityPurchasable(
        record({ offerId: 'artist-visibility-offer-contract-v1' })
      )
    ).toBe(true);
    expect(
      isCapabilityPurchasable(
        record({
          offerId: 'artist-visibility-offer-contract-v1',
          access: 'unavailable',
        })
      )
    ).toBe(false);
  });
});

describe('feature availability contract — fail closed', () => {
  it('unknown capability and unknown routes deny everything', () => {
    expect(getCapabilityRecord('does-not-exist')).toBeNull();
    expect(getCapabilityRecord(undefined)).toBeNull();
    expect(getRouteCapability('/nowhere')).toBeNull();
    expect(getRouteCapability(undefined)).toBeNull();
    expect(isFeatureUsable(null)).toBe(false);
    expect(isCapabilityIndexable(null)).toBe(false);
    expect(isCapabilityNavigable(null)).toBe(false);
    expect(isCapabilityPurchasable(null)).toBe(false);
    expect(describeFeatureAccess(null)).toBe('Not available.');
  });

  it('unknown maturity fails closed on access, purchase, and registry lookup', () => {
    const r = record({ maturity: 'mystery' as never });
    expect(getCapabilityRecord('unregistered-capability')).toBeNull();
    expect(isFeatureUsable(r)).toBe(false);
    expect(
      isCapabilityPurchasable({
        ...r,
        offerId: 'artist-visibility-offer-contract-v1',
      })
    ).toBe(false);
  });
});

describe('route publication policy — real registry', () => {
  it('every bound route resolves to a registered capability', () => {
    for (const [path, capabilityId] of Object.entries(
      ROUTE_CAPABILITY_BINDINGS
    )) {
      expect(getRouteCapability(path)?.capabilityId).toBe(capabilityId);
      expect(MARKETING_FEATURE_CAPABILITIES[capabilityId]).toBeDefined();
    }
  });

  it('/card is a published demand-validation page with access disabled', () => {
    const policy = resolveMarketingRoutePolicy({
      url: '/card',
      status: 'active',
    });
    expect(policy.publishable).toBe(true);
    expect(policy.indexable).toBe(true);
    expect(policy.interestCaptureOnly).toBe(true);
    expect(policy.purchasable).toBe(false);
    expect(policy.accessLabel).toContain('planned');
    expect(policy.audience).toBe('general');
    expect(policy.contentRevision).toBe('2026-09-19');
  });

  it('/voice is unlisted: renderable and navigable, not indexable', () => {
    const policy = resolveMarketingRoutePolicy({
      url: '/voice',
      status: 'active',
    });
    expect(policy.publishable).toBe(true);
    expect(policy.indexable).toBe(false);
    expect(policy.navigable).toBe(true);
  });

  it('manifest noindex stays authoritative for unbound routes', () => {
    const policy = resolveMarketingRoutePolicy({
      url: '/about',
      status: 'active',
      noindex: true,
    });
    expect(policy.indexable).toBe(false);
    expect(policy.publishable).toBe(true);
  });

  it('internal-only capability routes are not publishable or indexable', () => {
    // deliberate-red fixture shape, exercised via the real predicates
    const r = record({ publication: 'internal_only', proofAuthorized: false });
    expect(isPublicationPermitted(r)).toBe(false);
    expect(isCapabilityIndexable(r)).toBe(false);
  });

  it('capability index gate composes with sitemap rules', () => {
    expect(
      isSitemapIndexableMarketingRoute({ url: '/card', status: 'active' })
    ).toBe(true);
    expect(
      isSitemapIndexableMarketingRoute({ url: '/voice', status: 'active' })
    ).toBe(false);
    expect(isIndexableCapabilityPath('/card')).toBe(true);
    expect(isIndexableCapabilityPath('/voice')).toBe(false);
  });
});

describe('navigation consumes the shared policy', () => {
  it('all current header and footer destinations are policy-eligible', () => {
    for (const link of MARKETING_NAV_LINKS) {
      expect(isNavigationEligiblePath(link.href)).toBe(true);
    }
    for (const column of MARKETING_FOOTER_COLUMNS) {
      for (const link of column.links) {
        expect(link.external || isNavigationEligiblePath(link.href)).toBe(true);
      }
    }
  });

  it('generic Product link does not resolve to an artist-only capability', () => {
    const policy = resolveMarketingRoutePolicy({
      url: '/product',
      status: 'active',
    });
    expect(policy.audience).toBe('general');
    expect(isNavigableRoute('/product')).toBe(true);
  });

  it('artist-bound routes carry icp audience scope', () => {
    for (const path of ['/artist-profiles', '/smart-links', '/pay']) {
      expect(
        resolveMarketingRoutePolicy({ url: path, status: 'active' }).audience
      ).toBe('icp');
    }
  });
});
