import { describe, expect, it } from 'vitest';
import {
  type HypotheticalPricedRoundInput,
  previewHypotheticalPricedRound,
} from './hypothetical-dilution';

// Synthetic scenario only; no company financing terms or cap-table data.
const SYNTHETIC: HypotheticalPricedRoundInput = {
  instrument: 'priced-equity',
  valuationBasis: 'pre-money',
  valuationMinor: 800_000_000,
  ownershipBeforePercent: 72,
  committedMinor: 80_000_000,
  proposedMinor: 120_000_000,
  convertingSecurities: 'none',
  optionPoolChange: 'none',
  existingHolderInvestment: 'none',
};

function preview(overrides: Partial<HypotheticalPricedRoundInput> = {}) {
  return previewHypotheticalPricedRound({ ...SYNTHETIC, ...overrides });
}

function validPreview(overrides: Partial<HypotheticalPricedRoundInput> = {}) {
  const result = preview(overrides);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Synthetic scenario should be supported');
  return result;
}

describe('hypothetical priced-round dilution', () => {
  it('matches an independent share-issuance calculation, without rounding', () => {
    const result = validPreview();
    // Synthetic baseline: 1,000,000 fully diluted shares, 720,000 held.
    // 800 cents/share; committed cash buys 100,000 shares, proposed 150,000.
    expect(result.ownershipBeforePercent).toBe(72);
    expect(result.preMoneyValuationMinor).toBe(800_000_000);
    expect(result.committedOnly.ownershipPercent).toBeCloseTo(
      (720_000 / 1_100_000) * 100,
      12
    );
    expect(result.committedAndProposed.ownershipPercent).toBeCloseTo(
      (720_000 / 1_250_000) * 100,
      12
    );
    expect(result.committedAndProposed.newInvestorsPercent).toBe(20);
    expect(
      result.committedAndProposed.ownershipDecreasePercentagePoints
    ).toBeCloseTo(14.4, 12);
    expect(result.committedOnly.newMoneyMinor).toBe(80_000_000);
    expect(result.committedOnly.postMoneyValuationMinor).toBe(880_000_000);
    expect(result.committedAndProposed.newMoneyMinor).toBe(200_000_000);
    expect(result.committedAndProposed.postMoneyValuationMinor).toBe(
      1_000_000_000
    );
  });

  it('derives pre-money once from the full post-money scenario', () => {
    const fromPost = validPreview({
      valuationBasis: 'post-money',
      valuationMinor: 1_000_000_000,
    });
    expect(fromPost).toEqual(validPreview());
    // Removing proposed cash holds the same share price / pre-money value.
    expect(fromPost.committedOnly.postMoneyValuationMinor).toBe(880_000_000);
  });

  it('keeps proposed money separate from user-described committed money', () => {
    const proposedOnly = validPreview({ committedMinor: 0 });
    expect(proposedOnly.committedOnly.ownershipPercent).toBe(72);
    expect(proposedOnly.committedOnly.newInvestorsPercent).toBe(0);
    expect(proposedOnly.committedAndProposed.ownershipPercent).toBeLessThan(72);
    const committedOnly = validPreview({ proposedMinor: 0 });
    expect(committedOnly.committedAndProposed).toEqual(
      committedOnly.committedOnly
    );
  });

  it.each(['pre-money', 'post-money'] as const)(
    'preserves ownership with no new cash on a %s basis',
    valuationBasis => {
      const result = validPreview({
        valuationBasis,
        committedMinor: 0,
        proposedMinor: 0,
      });
      expect(result.committedOnly.ownershipPercent).toBe(72);
      expect(result.committedAndProposed.ownershipPercent).toBe(72);
      expect(result.committedAndProposed.newInvestorsPercent).toBe(0);
      expect(
        result.committedAndProposed.ownershipDecreasePercentagePoints
      ).toBe(0);
    }
  );

  it('accepts zero and full initial ownership without claiming legal control', () => {
    expect(
      validPreview({ ownershipBeforePercent: 0 }).committedAndProposed
        .ownershipPercent
    ).toBe(0);
    expect(
      validPreview({ ownershipBeforePercent: 100 }).committedAndProposed
        .ownershipPercent
    ).toBe(80);
    expect(
      validPreview({ ownershipBeforePercent: 60 }).committedAndProposed
        .ownershipPercent
    ).toBe(48);
  });

  it.each([NaN, Infinity, -Infinity, -1, 100.001])(
    'rejects invalid ownership %s',
    ownershipBeforePercent => {
      expect(preview({ ownershipBeforePercent })).toEqual({
        ok: false,
        error: 'invalid-ownership',
      });
    }
  );

  it.each(['valuationMinor', 'committedMinor', 'proposedMinor'] as const)(
    'rejects negative, fractional, nonfinite, and unsafe money in %s',
    field => {
      for (const value of [
        -1,
        0.5,
        NaN,
        Infinity,
        -Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        expect(preview({ [field]: value })).toEqual({
          ok: false,
          error: 'invalid-money',
        });
      }
    }
  );

  it('requires positive valuation and a positive derived pre-money value', () => {
    expect(preview({ valuationMinor: 0 })).toEqual({
      ok: false,
      error: 'invalid-money',
    });
    for (const valuationMinor of [200_000_000, 199_999_999]) {
      expect(preview({ valuationBasis: 'post-money', valuationMinor })).toEqual(
        {
          ok: false,
          error: 'nonpositive-pre-money',
        }
      );
    }
  });

  it('refuses unsafe cash totals and post-money sums instead of rounding money', () => {
    expect(
      preview({ committedMinor: Number.MAX_SAFE_INTEGER, proposedMinor: 1 })
    ).toEqual({
      ok: false,
      error: 'money-overflow',
    });
    expect(
      preview({
        valuationMinor: Number.MAX_SAFE_INTEGER,
        committedMinor: 1,
        proposedMinor: 0,
      })
    ).toEqual({
      ok: false,
      error: 'money-overflow',
    });
    expect(
      validPreview({
        valuationMinor: Number.MAX_SAFE_INTEGER - 10,
        committedMinor: 3,
        proposedMinor: 7,
      }).committedAndProposed.postMoneyValuationMinor
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('retains small nonzero losses at the numeric boundary', () => {
    const result = validPreview({
      valuationMinor: Number.MAX_SAFE_INTEGER - 1,
      committedMinor: 0,
      proposedMinor: 1,
    });
    expect(
      result.committedAndProposed.ownershipDecreasePercentagePoints
    ).toBeGreaterThan(0);
    expect(Number.isFinite(result.committedAndProposed.ownershipPercent)).toBe(
      true
    );
  });

  it('labels unsupported instruments and assumptions rather than approximating them', () => {
    const unsupported: Partial<HypotheticalPricedRoundInput>[] = [
      { instrument: 'safe' },
      { instrument: 'convertible-note' },
      { instrument: 'mixed' },
      { convertingSecurities: 'present' },
      { optionPoolChange: 'present' },
      { existingHolderInvestment: 'present' },
    ];
    for (const terms of unsupported) {
      expect(preview(terms)).toEqual({ ok: false, error: 'unsupported-terms' });
    }
  });

  it('fails closed on missing assumptions, unknown bases, and string numbers at runtime', () => {
    for (const terms of [
      { convertingSecurities: undefined },
      { optionPoolChange: undefined },
      { existingHolderInvestment: undefined },
      { instrument: 'unknown' },
      { valuationBasis: 'unknown' },
    ]) {
      expect(
        previewHypotheticalPricedRound({
          ...SYNTHETIC,
          ...terms,
        } as HypotheticalPricedRoundInput)
      ).toEqual({ ok: false, error: 'unsupported-terms' });
    }
    expect(
      previewHypotheticalPricedRound({
        ...SYNTHETIC,
        valuationMinor: '800000000',
      } as unknown as HypotheticalPricedRoundInput)
    ).toEqual({ ok: false, error: 'invalid-money' });
    expect(
      previewHypotheticalPricedRound({
        ...SYNTHETIC,
        ownershipBeforePercent: '72',
      } as unknown as HypotheticalPricedRoundInput)
    ).toEqual({ ok: false, error: 'invalid-ownership' });
  });

  it('is deterministic and leaves caller inputs untouched', () => {
    const input = Object.freeze({ ...SYNTHETIC });
    expect(previewHypotheticalPricedRound(input)).toEqual(
      previewHypotheticalPricedRound(input)
    );
    expect(input).toEqual(SYNTHETIC);
  });

  it('preserves conservation, monotonicity, scaling, and pre/post equivalence', () => {
    // Bounded deterministic property grid: 240 synthetic combinations, no I/O.
    for (const ownershipBeforePercent of [0, 0.01, 51, 100]) {
      for (const valuationMinor of [1, 113, 1_000_000]) {
        for (const committedMinor of [0, 1, 37, 1_000]) {
          for (const proposedMinor of [0, 1, 23, 900, 1_000_000]) {
            const input = {
              ownershipBeforePercent,
              valuationMinor,
              committedMinor,
              proposedMinor,
            };
            const result = validPreview(input);
            const full = result.committedAndProposed;
            const retainedOtherPercent =
              ((100 - ownershipBeforePercent) * valuationMinor) /
              full.postMoneyValuationMinor;
            expect(
              full.ownershipPercent +
                retainedOtherPercent +
                full.newInvestorsPercent
            ).toBeCloseTo(100, 10);
            expect(full.ownershipPercent).toBeGreaterThanOrEqual(0);
            expect(full.ownershipPercent).toBeLessThanOrEqual(
              result.committedOnly.ownershipPercent
            );
            expect(result.committedOnly.ownershipPercent).toBeLessThanOrEqual(
              ownershipBeforePercent
            );
            expect(
              full.ownershipPercent + full.ownershipDecreasePercentagePoints
            ).toBeCloseTo(ownershipBeforePercent, 10);
            expect(
              validPreview({
                ...input,
                valuationBasis: 'post-money',
                valuationMinor: full.postMoneyValuationMinor,
              })
            ).toEqual(result);
            const scaled = validPreview({
              ...input,
              valuationMinor: valuationMinor * 17,
              committedMinor: committedMinor * 17,
              proposedMinor: proposedMinor * 17,
            });
            expect(scaled.committedAndProposed.ownershipPercent).toBeCloseTo(
              full.ownershipPercent,
              10
            );
            expect(
              validPreview({
                ...input,
                committedMinor: proposedMinor,
                proposedMinor: committedMinor,
              }).committedAndProposed
            ).toEqual(full);
          }
        }
      }
    }
  });
});
