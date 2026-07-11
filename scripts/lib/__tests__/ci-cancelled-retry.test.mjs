import { describe, expect, it } from 'vitest';
import { cancelledDagRetryDecision } from '../ci-cancelled-retry.mjs';

describe('cancelledDagRetryDecision', () => {
  it('reruns once when cancelled preview/build makes PR Ready false-red', () => {
    const result = cancelledDagRetryDecision([
      { name: 'Path Changes', conclusion: 'success' },
      { name: 'CI Risk Classifier', conclusion: 'success' },
      { name: 'ci-fast', conclusion: 'success' },
      { name: 'Unit Tests (1/5)', conclusion: 'success' },
      { name: 'Build (public routes)', conclusion: 'cancelled' },
      { name: 'Preview Deploy (PR)', conclusion: 'cancelled' },
      { name: 'PR Ready', conclusion: 'failure' },
    ]);

    expect(result.shouldRerun).toBe(true);
    expect(result.reason).toContain('Preview Deploy (PR)');
  });

  it('does not rerun a real preview failure', () => {
    const result = cancelledDagRetryDecision([
      { name: 'Path Changes', conclusion: 'success' },
      { name: 'Preview Deploy (PR)', conclusion: 'failure' },
      { name: 'PR Ready', conclusion: 'failure' },
    ]);

    expect(result).toEqual({
      shouldRerun: false,
      reason: 'no cancelled aggregate false-red',
    });
  });

  it('does not mask terminal core failures or retry more than once', () => {
    expect(
      cancelledDagRetryDecision([
        { name: 'ci-fast', conclusion: 'failure' },
        { name: 'Preview Deploy (PR)', conclusion: 'cancelled' },
        { name: 'PR Ready', conclusion: 'failure' },
      ]).shouldRerun
    ).toBe(false);

    expect(
      cancelledDagRetryDecision(
        [
          { name: 'Preview Deploy (PR)', conclusion: 'cancelled' },
          { name: 'PR Ready', conclusion: 'failure' },
        ],
        2
      ).reason
    ).toBe('automatic retry already consumed');
  });
});
