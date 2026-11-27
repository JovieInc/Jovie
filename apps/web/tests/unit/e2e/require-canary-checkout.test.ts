import { describe, expect, it, vi } from 'vitest';
import { requireCanaryCheckout } from '../../e2e/helpers/require-canary-checkout';

describe('canary checkout response boundary', () => {
  it.each([
    ['bps_fixture', false, 'already-subscribed portal response'],
    ['cs_test_fixture', true, 'already-subscribed portal response'],
    ['cs_live_fixture', false, 'expected a Stripe TEST checkout session'],
    ['unexpected', false, 'expected a Stripe TEST checkout session'],
  ] as const)('blocks %s (alreadySubscribed=%s)', (sessionId, flag, reason) => {
    const blocked = vi.fn();
    expect(() =>
      requireCanaryCheckout(
        { sessionId, alreadySubscribed: flag, url: '' },
        blocked
      )
    ).toThrow(reason);
    expect(blocked).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(reason)
    );
  });

  it('preserves a fresh TEST checkout for the real Stripe and entitlement checks', () => {
    const result = {
      sessionId: 'cs_test_fixture',
      url: 'https://example.test',
    };
    const blocked = vi.fn();
    expect(requireCanaryCheckout(result, blocked)).toBe(result);
    expect(blocked).not.toHaveBeenCalled();
  });
});
