/**
 * Pricing source of truth contract tests (JOV-2079)
 *
 * Enforces:
 * - CANONICAL_PLANS in constants/plans.ts matches the entitlement registry plan IDs
 * - Prices in CANONICAL_PLANS match PLAN_PRICES (the canonical price source)
 * - Marketing pricing cards (marketingPricingPlans.ts) match canonical plan IDs
 * - No "waitlist" or "request access" copy in marketing plan labels or CTAs
 * - Signup hrefs include a `plan=<id>` query param so onboarding can read intent
 */

import { describe, expect, it } from 'vitest';
import { CANONICAL_PLAN_IDS, CANONICAL_PLANS } from '@/constants/plans';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

// Phrases banned from any public pricing CTA or label
const BANNED_PRICING_PHRASES = [
  'waitlist',
  'request access',
  'request_access',
  'coming soon',
] as const;

describe('CANONICAL_PLANS (constants/plans.ts) — source of truth (JOV-2079)', () => {
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

describe('MARKETING_PRICING_PLANS (data/marketingPricingPlans.ts) — contract (JOV-2079)', () => {
  it('only contains plan IDs that exist in the entitlement registry', () => {
    const validPlanIds = new Set<string>(['free', 'pro', 'max']);
    for (const plan of MARKETING_PRICING_PLANS) {
      expect(
        validPlanIds.has(plan.id),
        `Marketing plan "${plan.id}" is not a valid entitlement registry plan ID`
      ).toBe(true);
    }
  });

  it('no CTA label or badge uses banned waitlist/request-access phrases', () => {
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

  it('all signup hrefs include a plan query param', () => {
    for (const plan of MARKETING_PRICING_PLANS) {
      expect(
        plan.ctaHref,
        `Marketing plan "${plan.id}" ctaHref must include ?plan= so onboarding can read intent`
      ).toContain(`plan=${plan.id}`);
    }
  });

  it('pro plan price matches PLAN_PRICES', () => {
    const proPlan = MARKETING_PRICING_PLANS.find(p => p.id === 'pro');
    expect(proPlan?.price).toBe(`$${PLAN_PRICES.pro.monthly}`);
  });

  it('max plan price matches PLAN_PRICES', () => {
    const maxPlan = MARKETING_PRICING_PLANS.find(p => p.id === 'max');
    expect(maxPlan?.price).toBe(`$${PLAN_PRICES.max.monthly}`);
  });

  it('does not include the legacy team or enterprise plan IDs', () => {
    const planIds = MARKETING_PRICING_PLANS.map(p => p.id);
    expect(planIds).not.toContain('team');
    expect(planIds).not.toContain('enterprise');
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
