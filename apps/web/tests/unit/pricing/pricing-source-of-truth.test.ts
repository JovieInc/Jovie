/**
 * Pricing source of truth contract tests (JOV-2178)
 *
 * Enforces:
 * - CANONICAL_PLANS in constants/plans.ts matches the entitlement registry plan IDs
 * - Prices in CANONICAL_PLANS match PLAN_PRICES (the canonical price source)
 * - Marketing pricing cards (marketingPricingPlans.ts) match canonical plan IDs
 * - Public acquisition claims expose limited-access CTAs without changing
 *   internal canonical plan IDs or signup helpers
 */

import { describe, expect, it } from 'vitest';
import { CANONICAL_PLAN_IDS, CANONICAL_PLANS } from '@/constants/plans';
import {
  getMarketingPlanHref,
  getVisibleMarketingPricingPlans,
  MARKETING_PRICING_PLAN_IDS,
  MARKETING_PRICING_PLANS,
} from '@/data/marketingPricingPlans';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import {
  ENTITLEMENT_REGISTRY,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';

// Phrases banned from any public pricing CTA or label
const BANNED_PRICING_PHRASES = ['coming soon'] as const;

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

  it('derives pro price from public offer truth (no hardcoding)', () => {
    const proPlan = CANONICAL_PLANS.find(p => p.id === 'pro');
    const proClaim = getPublicPriceClaim('pro');
    expect(proPlan?.monthlyPriceUsd).toBe(proClaim.priceUsd);
    expect(proPlan?.yearlyPriceUsd).toBe(proClaim.annualPriceUsd);
    expect(proPlan?.monthlyPriceUsd).toBe(PLAN_PRICES.pro.monthly);
    expect(proPlan?.yearlyPriceUsd).toBeNull();
    expect(proPlan?.ctaLabel).toBe(proClaim.ctaLabel);
    expect(proPlan?.signupHref).toBe(proClaim.ctaHref);
  });

  it('does not publish a self-service Max price', () => {
    const maxPlan = CANONICAL_PLANS.find(p => p.id === 'max');
    const maxClaim = getPublicPriceClaim('max');
    expect(maxPlan?.monthlyPriceUsd).toBeNull();
    expect(maxPlan?.yearlyPriceUsd).toBeNull();
    expect(maxPlan?.monthlyPriceLabel).toBe(maxClaim.priceLabel);
    expect(maxPlan?.ctaLabel).toBe(maxClaim.ctaLabel);
    expect(maxPlan?.signupHref).toBe(maxClaim.ctaHref);
    expect(maxPlan?.signupHref).not.toContain('/signup');
  });

  it('free plan has zero monthly price', () => {
    const freePlan = CANONICAL_PLANS.find(p => p.id === 'free');
    expect(freePlan?.monthlyPriceUsd).toBe(0);
  });

  it('self-service signup hrefs include a plan query param', () => {
    for (const plan of CANONICAL_PLANS) {
      const claim = getPublicPriceClaim(plan.id);
      expect(plan.signupHref).toBe(claim.ctaHref);
      if (claim.selfService) {
        expect(
          plan.signupHref,
          `Plan "${plan.id}" signupHref must include ?plan= so onboarding can read intent`
        ).toContain(`plan=${plan.id}`);
      }
    }
  });

  it('keeps canonical plan labels free of planned-state copy', () => {
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

describe('MARKETING_PRICING_PLANS (data/marketingPricingPlans.ts) — contract (JOV-2178)', () => {
  it('keeps runtime tiers separate from the public Enterprise acquisition card', () => {
    const validPlanIds = new Set<string>(Object.keys(ENTITLEMENT_REGISTRY));
    for (const plan of MARKETING_PRICING_PLANS) {
      if (plan.id === 'enterprise') continue;
      expect(
        validPlanIds.has(plan.id),
        `Marketing plan "${plan.id}" is not a valid entitlement registry plan ID`
      ).toBe(true);
    }
  });

  it('uses the canonical public billing tiers and visible pricing excludes legacy tiers', () => {
    expect(MARKETING_PRICING_PLAN_IDS).toEqual(['free', 'pro', 'enterprise']);
    expect(MARKETING_PRICING_PLANS.map(plan => plan.id)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
    expect(getVisibleMarketingPricingPlans().map(plan => plan.id)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
  });

  it('keeps planned and unsupported copy out of public plan cards', () => {
    for (const plan of MARKETING_PRICING_PLANS) {
      const textToCheck = [plan.ctaLabel, plan.badge, plan.body]
        .join(' ')
        .toLowerCase();
      for (const phrase of BANNED_PRICING_PHRASES) {
        expect(
          textToCheck,
          `Marketing plan "${plan.id}" contains banned phrase: "${phrase}"`
        ).not.toContain(phrase);
      }
    }
  });

  it('derives CTA hrefs from public offer truth', () => {
    for (const plan of MARKETING_PRICING_PLANS) {
      const claim = getPublicPriceClaim(plan.id);
      expect(plan.ctaHref).toBe(claim.ctaHref);
      expect(plan.ctaLabel).toBe(claim.ctaLabel);
      expect(getMarketingPlanHref(plan.id)).toBe(plan.ctaHref);

      if (claim.selfService) {
        expect(
          plan.ctaHref,
          `Marketing plan "${plan.id}" ctaHref must include ?plan= so onboarding can read intent`
        ).toContain(`plan=${plan.id}`);
        const signupUrl = new URL(plan.ctaHref, 'https://jov.ie');
        expect(resolveCanonicalPlanId(signupUrl.searchParams.get('plan'))).toBe(
          plan.id
        );
      } else if (plan.id === 'pro') {
        expect(plan.ctaHref).toBe('/waitlist');
      } else {
        expect(plan.ctaHref.startsWith('mailto:')).toBe(true);
      }
    }
  });

  it('pro plan price matches public offer truth and PLAN_PRICES', () => {
    const proPlan = MARKETING_PRICING_PLANS.find(p => p.id === 'pro');
    const proClaim = getPublicPriceClaim('pro');
    expect(proPlan?.price).toBe(proClaim.priceLabel);
    expect(proPlan?.price).toBe(`$${PLAN_PRICES.pro.monthly}`);
  });

  it('enterprise price stays custom and Max remains absent from acquisition cards', () => {
    const enterprisePlan = MARKETING_PRICING_PLANS.find(
      p => p.id === 'enterprise'
    );
    const enterpriseClaim = getPublicPriceClaim('enterprise');
    expect(enterprisePlan?.price).toBe(enterpriseClaim.priceLabel);
    expect(enterprisePlan?.price).toBe('Custom');
    expect(MARKETING_PRICING_PLANS.map(plan => plan.id)).not.toContain('max');
  });

  it('does not include the legacy team plan ID', () => {
    const planIds = MARKETING_PRICING_PLANS.map(p => p.id);
    expect(planIds).not.toContain('team');
    expect(planIds).toContain('enterprise');
  });

  it('does not advertise Max-only release operations on Pro or Enterprise', () => {
    const proPlan = MARKETING_PRICING_PLANS.find(p => p.id === 'pro');
    const enterprisePlan = MARKETING_PRICING_PLANS.find(
      p => p.id === 'enterprise'
    );
    expect(proPlan).toBeDefined();
    expect(enterprisePlan).toBeDefined();

    for (const { label, entitlement } of MAX_ONLY_MARKETING_FEATURES) {
      expect(
        ENTITLEMENT_REGISTRY.pro.booleans[entitlement],
        `${label} must remain disabled for Pro in the entitlement registry`
      ).toBe(false);
      expect(
        ENTITLEMENT_REGISTRY.max.booleans[entitlement],
        `${label} must remain enabled for Max in the entitlement registry`
      ).toBe(true);
      expect(proPlan?.features).not.toContain(label);
      expect(enterprisePlan?.features).not.toContain(label);
      expect(ENTITLEMENT_REGISTRY.max.marketing.features).toContain(label);
    }
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
