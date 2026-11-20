/**
 * Hypothetical economic ownership only. No cap-table, CRM, persistence, or I/O.
 * All money uses integer minor units in one currency (for USD, cents).
 */
export interface HypotheticalPricedRoundInput {
  readonly instrument: 'priced-equity' | 'safe' | 'convertible-note' | 'mixed';
  readonly valuationBasis: 'pre-money' | 'post-money';
  readonly valuationMinor: number;
  /** Fully diluted ownership immediately BEFORE all modeled new shares. */
  readonly ownershipBeforePercent: number;
  /** User-described, unverified; not already included in the before baseline. */
  readonly committedMinor: number;
  readonly proposedMinor: number;
  readonly convertingSecurities: 'none' | 'present';
  readonly optionPoolChange: 'none' | 'present';
  readonly existingHolderInvestment: 'none' | 'present';
}

export interface HypotheticalOwnershipSnapshot {
  readonly newMoneyMinor: number;
  readonly postMoneyValuationMinor: number;
  readonly ownershipPercent: number;
  readonly newInvestorsPercent: number;
  readonly ownershipDecreasePercentagePoints: number;
}

export type HypotheticalPricedRoundResult =
  | {
      readonly ok: true;
      readonly preMoneyValuationMinor: number;
      readonly ownershipBeforePercent: number;
      readonly committedOnly: HypotheticalOwnershipSnapshot;
      readonly committedAndProposed: HypotheticalOwnershipSnapshot;
    }
  | {
      readonly ok: false;
      readonly error:
        | 'unsupported-terms'
        | 'invalid-ownership'
        | 'invalid-money'
        | 'money-overflow'
        | 'nonpositive-pre-money';
    };

/**
 * A single primary priced round, one share price, no conversions, pool changes,
 * secondary sales, or participation by the holder being modeled. The baseline
 * must already include existing fully diluted shares/options on the same basis.
 *
 * post = pre + new cash; retained fraction = pre / post;
 * ownership after = ownership before * retained fraction.
 * Source (checked 2026-10-25):
 * https://www.cooleygo.com/glossary/pre-money-valuation/
 *
 * A post-money input describes the COMPLETE modeled round. Subtract BOTH cash
 * amounts once to derive pre-money, then hold pre-money fixed for both scenarios.
 * Committed-only is a counterfactual with proposed cash removed at that price,
 * not a statement that committed cash has closed or shares have been issued.
 * Economic percentage does not evaluate votes, boards, classes, protective
 * provisions, liquidation preferences, or legal control.
 */
export function previewHypotheticalPricedRound(
  input: HypotheticalPricedRoundInput
): HypotheticalPricedRoundResult {
  if (
    input.instrument !== 'priced-equity' ||
    input.convertingSecurities !== 'none' ||
    input.optionPoolChange !== 'none' ||
    input.existingHolderInvestment !== 'none' ||
    (input.valuationBasis !== 'pre-money' &&
      input.valuationBasis !== 'post-money')
  ) {
    return { ok: false, error: 'unsupported-terms' };
  }

  if (
    !Number.isFinite(input.ownershipBeforePercent) ||
    input.ownershipBeforePercent < 0 ||
    input.ownershipBeforePercent > 100
  ) {
    return { ok: false, error: 'invalid-ownership' };
  }

  if (
    !isMoney(input.valuationMinor) ||
    input.valuationMinor === 0 ||
    !isMoney(input.committedMinor) ||
    !isMoney(input.proposedMinor)
  ) {
    return { ok: false, error: 'invalid-money' };
  }

  const totalMinor = input.committedMinor + input.proposedMinor;
  if (!Number.isSafeInteger(totalMinor)) {
    return { ok: false, error: 'money-overflow' };
  }

  const preMoneyValuationMinor =
    input.valuationBasis === 'pre-money'
      ? input.valuationMinor
      : input.valuationMinor - totalMinor;

  if (preMoneyValuationMinor <= 0) {
    return { ok: false, error: 'nonpositive-pre-money' };
  }
  if (!Number.isSafeInteger(preMoneyValuationMinor + totalMinor)) {
    return { ok: false, error: 'money-overflow' };
  }

  return {
    ok: true,
    preMoneyValuationMinor,
    ownershipBeforePercent: input.ownershipBeforePercent,
    committedOnly: snapshot(
      preMoneyValuationMinor,
      input.ownershipBeforePercent,
      input.committedMinor
    ),
    committedAndProposed: snapshot(
      preMoneyValuationMinor,
      input.ownershipBeforePercent,
      totalMinor
    ),
  };
}

function isMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function snapshot(
  preMoneyMinor: number,
  ownershipBeforePercent: number,
  newMoneyMinor: number
): HypotheticalOwnershipSnapshot {
  const postMoneyValuationMinor = preMoneyMinor + newMoneyMinor;
  const newInvestorFraction = newMoneyMinor / postMoneyValuationMinor;
  return {
    newMoneyMinor,
    postMoneyValuationMinor,
    ownershipPercent:
      ownershipBeforePercent * (preMoneyMinor / postMoneyValuationMinor),
    newInvestorsPercent: 100 * newInvestorFraction,
    ownershipDecreasePercentagePoints:
      ownershipBeforePercent * newInvestorFraction,
  };
}
