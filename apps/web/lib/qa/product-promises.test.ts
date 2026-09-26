import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getProductPromise, PRODUCT_PROMISES } from './product-promises';

const APP_ROUTE_VALUES = new Set<string>(Object.values(APP_ROUTES));

describe('PRODUCT_PROMISES registry', () => {
  it('encodes at least the signup onboarding promise', () => {
    expect(
      getProductPromise('anonymous-signup-onboarding-starts')
    ).toBeDefined();
  });

  it('has unique ids', () => {
    const ids = PRODUCT_PROMISES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(
    PRODUCT_PROMISES.map(p => [p.id, p] as const)
  )('%s is well-formed', (_id, promise) => {
    // Self-guarding: a typo entrypoint that is not a real route fails here.
    expect(
      APP_ROUTE_VALUES.has(promise.entrypoint),
      `entrypoint ${promise.entrypoint} is not an APP_ROUTES value`
    ).toBe(true);
    expect(promise.promise.length).toBeGreaterThan(0);
    expect(promise.successSignals.length).toBeGreaterThan(0);
    expect(promise.unacceptableFailures.length).toBeGreaterThan(0);
    expect(promise.suggestedCoverage.length).toBeGreaterThan(0);
  });

  it('points the signup promise at the deepened canary specs', () => {
    const signup = getProductPromise('anonymous-signup-onboarding-starts');
    expect(signup?.entrypoint).toBe(APP_ROUTES.START);
    expect(signup?.suggestedCoverage.join(' ')).toContain(
      'canary-onboarding-turn.spec.ts'
    );
  });
});
