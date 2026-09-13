/**
 * Pricing source of truth contract tests (JOV-2178)
 *
 * Enforces:
 * - CANONICAL_PLANS in constants/plans.ts matches the entitlement registry plan IDs
 * - Prices in CANONICAL_PLANS match PLAN_PRICES (the canonical price source)
 * - Public acquisition tiers are distinct from legacy subscriber plan IDs
 * - Unavailable acquisition uses explicit request-access copy
 * - Legacy signup hrefs retain plan intent for existing subscribers
 */

import { describe, expect, it } from 'vitest';
import { CANONICAL_PLAN_IDS, CANONICAL_PLANS } from '@/constants/plans';
import {
  getMarketingPlanHref,
  getVisibleMarketingPricingPlans,
  MARKETING_PRICING_PLAN_IDS,
  MARKETING_PRICING_PLANS,
} from '@/data/marketingPricingPlans';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

// Phrases banned from any public pricing CTA or label
const BANNED_PRICING_PHRASES = [
  'waitlist',
  'request access',
  'request_access',
  'coming soon',
] as const;

const MAX_ONLY_MARKETING_FEATURES = [
  {
    label: 'Release plan generation',
    entitlement: 'canGenerateReleasePlans',
  },
  {
    label: 'Metadata submission agent',
    entitlement: 'canAccessMetadataSubmissionAgent',
  },
  {
    label: 'Email campaigns',
    entitlement: 'canAccessEmailCampaigns',
  },
  {
    label: 'API access',
    entitlement: 'canAccessApiKeys',
  },
] as const;

describe('CANONICAL_PLANS (constants/plans.ts) — source of truth (JOV-2178)', () => {
  it('contains exactly the three billing plan tiers: free, pro, max', () => {
    expect(CANONICAL_PLAN_IDS).toEqual(['free', 'pro', 'max']);
  });

  it('matches displayNames from the entitlement registry', () => {
    for (const plan of CANONICAL_PLANS) {
      if (plan.id === 'free') {
        expect(plan.displayName).toBe(
          ENTITLEMENT_REGISTRY.free.marketing.displayName
        );
      } else if (plan.id === 'pro') {
        expect(plan.displayName).toBe(
          ENTITLEMENT_REGISTRY.pro.marketing.displayName
        );
      } else if (plan.id === 'max') {
        expect(plan.displayName).toBe(
          ENTITLEMENT_REGISTRY.max.marketing.displayName
        );
      }
    }
  });

  it('derives pro price from PLAN_PRICES (no hardcoding)', () => {
    const proPlan = CANONICAL_PLANS.find(p => p.id === 'pro');
    expect(proPlan?.monthlyPriceUsd).toBe(PLAN_PRICES.pro.monthly);
    expect(proPlan?.yearlyPriceUsd).toBe(PLAN_PRICES.pro.yearly);
  });

  it('derives max price from PLAN_PRICES (no hardcoding)', () => {
    const maxPlan = CANONICAL_PLANS.find(p => p.id === 'max');
    expect(maxPlan?.monthlyPriceUsd).toBe(PLAN_PRICES.max.monthly);
    expect(maxPlan?.yearlyPriceUsd).toBe(PLAN_PRICES.max.yearly);
  });

  it('free plan has zero monthly price', () => {
    const freePlan = CANONICAL_PLANS.find(p => p.id === 'free');
    expect(freePlan?.monthlyPriceUsd).toBe(0);
  });

  it('all signup hrefs include a plan query param', () => {
    for (const plan of CANONICAL_PLANS) {
      expect(
        plan.signupHref,
        `Plan "${plan.id}" signupHref must include ?plan= so onboarding can read intent`
      ).toContain(`plan=${plan.id}`);
    }
  });

  it('no CTA label uses banned waitlist/request-access phrases', () => {
    for (const plan of CANONICAL_PLANS) {
      const ctaLower = plan.ctaLabel.toLowerCase();
      for (const phrase of BANNED_PRICING_PHRASES) {
        expect(
          ctaLower,
          `Plan "${plan.id}" ctaLabel "${plan.ctaLabel}" contains banned phrase: "${phrase}"`
        ).not.toContain(phrase);
      }
    }
  });

  it('all plans have non-empty features list', () => {
    for (const plan of CANONICAL_PLANS) {
      expect(
        plan.features.length,
        `Plan "${plan.id}" must have at least one feature`
      ).toBeGreaterThan(0);
    }
  });

  it('monthly price label matches monthlyPriceUsd', () => {
    for (const plan of CANONICAL_PLANS) {
      if (plan.monthlyPriceUsd !== null) {
        expect(plan.monthlyPriceLabel).toBe(`$${plan.monthlyPriceUsd}`);
      }
    }
  });
});

describe('Public Artist Visibility acquisition contract', () => {
  it('keeps Free, monthly Pro and Enterprise distinct from legacy subscriptions', () => {
    expect(MARKETING_PRICING_PLAN_IDS).toEqual(['free', 'pro', 'enterprise']);
    expect(getVisibleMarketingPricingPlans().map(plan => plan.id)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
    expect(MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro')?.price).toBe(
      '$199'
    );
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro')?.cadence
    ).toBe('/mo');
    expect(getMarketingPlanHref('pro')).toBe('https://jov.ie/waitlist');
    expect(getMarketingPlanHref('free')).toBe('https://jov.ie/waitlist');
    expect(getMarketingPlanHref('enterprise')).toBeNull();
  });
  it('does not grant legacy Max entitlements through new public copy', () => {
    const pro = MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro');
    for (const { label, entitlement } of MAX_ONLY_MARKETING_FEATURES) {
      expect(ENTITLEMENT_REGISTRY.pro.booleans[entitlement]).toBe(false);
      expect(ENTITLEMENT_REGISTRY.max.booleans[entitlement]).toBe(true);
      expect(pro?.features).not.toContain(label);
    }
  });
  it('explicitly identifies planned capability and free profile permanence', () => {
    const pro = MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro');
    expect(pro?.badge).toBe('Limited access');
    expect(pro?.features.every(feature => feature.endsWith('— planned'))).toBe(
      true
    );
    expect(pro?.offerNote).toContain('not yet generally available');
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'free')?.offerNote
    ).toContain('free');
  });
  it('has non-empty features list for every plan (no silent drift from canonical plans)', () => {
    // MARKETING_PRICING_PLANS uses curated marketing copy (short, benefit-oriented)
    // while CANONICAL_PLANS derives features from the entitlement registry (granular).
    // They intentionally differ in wording and level of detail — that is by design.
    // This test ensures the marketing feature list is never inadvertently emptied
    // when canonical plan data is restructured.
    for (const marketingPlan of MARKETING_PRICING_PLANS) {
      const canonicalPlan = CANONICAL_PLANS.find(
        p => p.id === marketingPlan.id
      );
      if (canonicalPlan === undefined) continue;

      expect(
        marketingPlan.features.length,
        `Marketing plan "${marketingPlan.id}" feature list is empty — update marketingPricingPlans.ts when canonical features change`
      ).toBeGreaterThan(0);

      expect(
        canonicalPlan.features.length,
        `Canonical plan "${canonicalPlan.id}" feature list is empty — check entitlement registry`
      ).toBeGreaterThan(0);
    }
  });
});
