/**
 * BillingUnavailableError contract tests (deprecated compat surface for entitlements-registry RED).
 *
 * Covers:
 * - Public error class constructor retained for backwards compat (never thrown in current getCurrentUserEntitlements)
 * - Message formatting, property exposure (userId, isAdmin)
 * - Billing unavailable edge case representation (fail-closed degradation paths use this shape in older callers)
 *
 * These are representative contract tests per prior coverage rotations (webhook, rls, proxy, claim-onboarding):
 * exercising exported public API, error shapes, auth/fail-closed boundaries.
 * No direct DB row reads — all via server resolver as source of truth (mocks only).
 * Wires into Stryker for mutation killing on the class (registry + server surface, risk 37.7).
 *
 * @see apps/web/lib/entitlements/server.ts
 * @see docs/TEST_RISK_REGISTER.md entitlements-registry
 */
import { describe, expect, it } from 'vitest';
import { BillingUnavailableError } from '@/lib/entitlements/server';

describe('BillingUnavailableError (entitlements registry contract + billing unavailable edge)', () => {
  it('constructs correctly with all fields for compat callers', () => {
    const err = new BillingUnavailableError('user_123', true, 'stripe-timeout');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BillingUnavailableError);
    expect(err.name).toBe('BillingUnavailableError');
    expect(err.userId).toBe('user_123');
    expect(err.isAdmin).toBe(true);
    expect(err.message).toBe(
      'Billing data unavailable for user user_123: stripe-timeout'
    );
  });

  it('uses default "unknown" cause when omitted (fail-closed shape)', () => {
    const err = new BillingUnavailableError('user_456', false);

    expect(err.userId).toBe('user_456');
    expect(err.isAdmin).toBe(false);
    expect(err.message).toBe(
      'Billing data unavailable for user user_456: unknown'
    );
  });

  it('is exported and stable for any legacy direct consumers (no behavior change)', () => {
    // Ensures the deprecated export remains constructible without throw
    expect(
      () => new BillingUnavailableError('u', false, undefined)
    ).not.toThrow();
  });
});
