/**
 * Property tests for dunning decision helpers.
 *
 * Anthropic verification guidance: property tests catch edge cases agents
 * miss. These invariants must hold for every attempt count / status the
 * Stripe webhook can pass into dunning — not only the hand-picked cases in
 * dunning.test.ts. Weak assertion here is why lib/stripe/dunning.ts sits at
 * a 12.6% mutation floor.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isRecoveryScenario,
  shouldSendDunningEmail,
} from '@/lib/stripe/dunning';

describe('dunning properties', () => {
  it('sends dunning mail iff attemptCount is in 0..4', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 40 }), attemptCount => {
        expect(shouldSendDunningEmail(attemptCount)).toBe(attemptCount <= 4);
      }),
      { numRuns: 100 }
    );
  });

  it('recovery is true only for past_due | unpaid | incomplete', () => {
    const recovery = new Set(['past_due', 'unpaid', 'incomplete']);
    fc.assert(
      fc.property(
        fc.option(
          fc.constantFrom(
            'past_due',
            'unpaid',
            'incomplete',
            'active',
            'canceled',
            'trialing',
            'paused',
            ''
          ),
          { nil: undefined }
        ),
        previousStatus => {
          const expected =
            previousStatus !== undefined && recovery.has(previousStatus);
          expect(isRecoveryScenario(previousStatus)).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('attempt thresholds are monotonic: if n sends, every k < n also sends', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), n => {
        if (!shouldSendDunningEmail(n)) return true;
        for (let k = 0; k < n; k++) {
          expect(shouldSendDunningEmail(k)).toBe(true);
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });
});
