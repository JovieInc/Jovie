import { describe, expect, it } from 'vitest';
import { PROOF_PENDING_TERMS, PROOF_REVIEW_WINDOW } from './proof-terms';

describe('proof terms', () => {
  it('says plainly that proof, not payment, publishes the page', () => {
    expect(PROOF_PENDING_TERMS).toContain('goes live once we confirm');
    expect(PROOF_PENDING_TERMS).toContain('Paying does not change that');
    // The remedy is part of the terms at the moment of purchase.
    expect(PROOF_PENDING_TERMS).toContain(
      'cancel your subscription and refund'
    );
  });

  it('states no review window until one is measured (no invented timeframe)', () => {
    expect(PROOF_REVIEW_WINDOW).toBeNull();
    expect(PROOF_PENDING_TERMS).not.toMatch(/within|hours|days/i);
  });
});
