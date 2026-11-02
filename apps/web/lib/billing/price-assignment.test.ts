import { describe, expect, it } from 'vitest';
import {
  assertPriceExperimentsValid,
  PRICE_EXPERIMENTS,
  type PriceExperiment,
  resolveUserPrice,
} from './price-assignment';

const CANONICAL = 12;
const experiment: PriceExperiment = {
  id: 'pro-price-2026-11',
  plan: 'pro',
  legalRegisterCheckId: 'legal-123',
  decisionCardId: 'card-456',
  readOutBy: '2026-12-01',
  variants: [
    { id: 'control', monthlyUsd: CANONICAL, weight: 50 },
    { id: 'higher', monthlyUsd: 29, weight: 50 },
  ],
};

// The surfaces that display or charge a price. Each must resolve through the
// same function with the same user key.
const SURFACES = [
  'pricing',
  'claim',
  'onboarding',
  'email',
  'checkout',
] as const;

describe('sticky price assignment', () => {
  it('launch state has no experiment: every user sees the canonical price', () => {
    expect(PRICE_EXPERIMENTS).toEqual([]);
    for (const userKey of ['a', 'b', 'anon-123', '']) {
      expect(resolveUserPrice({ userKey })).toEqual({
        monthlyUsd: CANONICAL,
        experimentId: null,
        variantId: 'control',
      });
    }
  });

  it('shows one user one price on every surface and in checkout', () => {
    for (let i = 0; i < 500; i++) {
      const userKey = `user_${i}`;
      const prices = SURFACES.map(
        () => resolveUserPrice({ userKey }, [experiment], CANONICAL).monthlyUsd
      );
      expect(new Set(prices).size).toBe(1);
    }
  });

  it('is independent of call order and process state', () => {
    const forward = ['u1', 'u2', 'u3', 'u4'].map(
      userKey =>
        resolveUserPrice({ userKey }, [experiment], CANONICAL).monthlyUsd
    );
    const backward = ['u4', 'u3', 'u2', 'u1']
      .map(
        userKey =>
          resolveUserPrice({ userKey }, [experiment], CANONICAL).monthlyUsd
      )
      .reverse();
    expect(backward).toEqual(forward);
  });

  it('honors the weights roughly and uses both variants', () => {
    let higher = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (
        resolveUserPrice({ userKey: `u${i}` }, [experiment], CANONICAL)
          .variantId === 'higher'
      )
        higher++;
    }
    expect(higher / n).toBeGreaterThan(0.45);
    expect(higher / n).toBeLessThan(0.55);
  });

  it('grandfathers existing payers regardless of experiment', () => {
    for (let i = 0; i < 50; i++) {
      expect(
        resolveUserPrice(
          { userKey: `u${i}`, existingPayerMonthlyUsd: 199 },
          [experiment],
          CANONICAL
        )
      ).toMatchObject({ monthlyUsd: 199, variantId: 'grandfathered' });
    }
  });

  it('deliberate red: an experiment without a legal-register check is refused', () => {
    expect(() =>
      assertPriceExperimentsValid(
        [{ ...experiment, legalRegisterCheckId: ' ' }],
        CANONICAL
      )
    ).toThrow('legal-register check required');
    expect(() =>
      resolveUserPrice(
        { userKey: 'u1' },
        [{ ...experiment, legalRegisterCheckId: '' }],
        CANONICAL
      )
    ).toThrow();
  });

  it('deliberate red: refuses missing card, bad control, or concurrent experiments', () => {
    expect(() =>
      assertPriceExperimentsValid(
        [{ ...experiment, decisionCardId: '' }],
        CANONICAL
      )
    ).toThrow('decision card');
    expect(() =>
      assertPriceExperimentsValid(
        [
          {
            ...experiment,
            variants: [
              { id: 'control', monthlyUsd: 99, weight: 1 },
              { id: 'b', monthlyUsd: 29, weight: 1 },
            ],
          },
        ],
        CANONICAL
      )
    ).toThrow('control variant');
    expect(() =>
      assertPriceExperimentsValid(
        [experiment, { ...experiment, id: 'other' }],
        CANONICAL
      )
    ).toThrow('one concurrent');
    expect(() =>
      assertPriceExperimentsValid(
        [{ ...experiment, readOutBy: 'soon' }],
        CANONICAL
      )
    ).toThrow('readOutBy');
  });
});
