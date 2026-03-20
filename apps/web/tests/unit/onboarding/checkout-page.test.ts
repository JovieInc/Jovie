/**
 * Integration tests for onboarding checkout page server logic.
 *
 * Tests the plan resolution flow: cookie → query param → source param → recommendPlan.
 * Verifies that organic users get smart recommendations and explicit intent users
 * get their chosen plan.
 */
import { describe, expect, it } from 'vitest';
import type { PlanIntentTier } from '@/lib/auth/plan-intent';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntentFromCookies,
  isPaidIntent,
  recommendPlan,
  validatePlan,
} from '@/lib/auth/plan-intent';

/**
 * Simulate the server-side plan resolution logic from page.tsx.
 * This mirrors the actual code without requiring Next.js RSC infrastructure.
 */
function resolveCheckoutPlan(params: {
  cookieHeader: string;
  planParam: string | null;
  sourceParam: string | null;
  spotifyFollowers: number | null;
}): { plan: PlanIntentTier; isDefaultUpsell: boolean } {
  // Step 1: Read plan intent from cookie
  let planIntent: PlanIntentTier | null = getPlanIntentFromCookies(
    params.cookieHeader
  );

  // Step 2: Fall back to query param
  if (!planIntent) {
    planIntent = validatePlan(params.planParam);
  }

  // Step 3: Determine organic vs explicit from source param
  const isDefaultUpsell = params.sourceParam !== 'intent';

  // Step 4: Default to pro if no paid intent
  if (!planIntent || !isPaidIntent(planIntent)) {
    planIntent = DEFAULT_UPSELL_PLAN;
  }

  // Step 5: Smart recommendation for organic users
  if (isDefaultUpsell) {
    planIntent = recommendPlan(params.spotifyFollowers);
  }

  return { plan: planIntent, isDefaultUpsell };
}

describe('onboarding checkout page plan resolution', () => {
  it('organic user with no followers defaults to Pro', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'organic',
      spotifyFollowers: null,
    });
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('organic user with 15K followers gets Growth', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'organic',
      spotifyFollowers: 15_000,
    });
    expect(result.plan).toBe('growth');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('explicit intent with cookie gets their chosen plan', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: 'jovie_plan_intent=growth',
      planParam: null,
      sourceParam: 'intent',
      spotifyFollowers: 500,
    });
    expect(result.plan).toBe('growth');
    expect(result.isDefaultUpsell).toBe(false);
  });

  it('explicit intent without cookie uses query param plan', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'founding',
      sourceParam: 'intent',
      spotifyFollowers: null,
    });
    expect(result.plan).toBe('founding');
    expect(result.isDefaultUpsell).toBe(false);
  });

  it('source=intent is authoritative even when cookie expired', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'intent',
      spotifyFollowers: 50_000,
    });
    // source=intent means this was an explicit user, so no smart recommendation
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(false);
  });

  it('no source param defaults to organic (isDefaultUpsell=true)', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: null,
      sourceParam: null,
      spotifyFollowers: null,
    });
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('organic user with exactly 10K followers gets Growth', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'organic',
      spotifyFollowers: 10_000,
    });
    expect(result.plan).toBe('growth');
    expect(result.isDefaultUpsell).toBe(true);
  });
});
