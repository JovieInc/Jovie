/**
 * Integration tests for onboarding checkout page server logic.
 *
 * Tests the plan resolution flow: cookie → query param → source param → recommendPlan.
 * Verifies that organic users get smart recommendations and explicit intent users
 * get their chosen plan.
 */
import { describe, expect, it } from 'vitest';
import { resolveCheckoutPlan } from '@/lib/onboarding/checkout-plan-resolution';

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

  it('organic user with 15K followers gets Max', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'organic',
      spotifyFollowers: 15_000,
    });
    expect(result.plan).toBe('max');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('explicit intent with cookie gets their chosen plan', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: 'jovie_plan_intent=max',
      planParam: null,
      sourceParam: 'intent',
      spotifyFollowers: 500,
    });
    expect(result.plan).toBe('max');
    expect(result.isDefaultUpsell).toBe(false);
  });

  it('explicit intent without cookie uses query param plan', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'intent',
      spotifyFollowers: null,
    });
    expect(result.plan).toBe('pro');
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

  it('organic user with exactly 10K followers gets Max', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: 'pro',
      sourceParam: 'organic',
      spotifyFollowers: 10_000,
    });
    expect(result.plan).toBe('max');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('pro plan cookie is NOT overridden when source param is absent', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: 'jovie_plan_intent=pro',
      planParam: 'pro',
      sourceParam: null,
      spotifyFollowers: 50_000,
    });
    // Pro cookie = paid intent, so recommendPlan must NOT override it
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('pro plan cookie preserved even with source=organic', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: 'jovie_plan_intent=pro',
      planParam: null,
      sourceParam: 'organic',
      spotifyFollowers: 15_000,
    });
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(true);
  });

  it('falls back to pro when Max plan is disabled', () => {
    const result = resolveCheckoutPlan({
      cookieHeader: '',
      planParam: null,
      sourceParam: 'organic',
      spotifyFollowers: 50_000,
      maxPlanEnabled: false,
    });
    expect(result.plan).toBe('pro');
    expect(result.isDefaultUpsell).toBe(true);
  });
});
