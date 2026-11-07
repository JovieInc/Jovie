/** Fundraise policy for the default-alive engine. Each rule names its source. */

interface PolicyRule<T> {
  readonly value: T;
  readonly source: string;
}

export interface FundraisePolicy {
  readonly runwayTargetMonths: PolicyRule<{
    readonly min: number;
    readonly max: number;
  }>;
  /** Margin over modelled capital need, 0.25 = 25%. */
  readonly marginRate: PolicyRule<number>;
  /** How long a raise takes from first meeting to cash in the bank. */
  readonly fundraiseDurationMonths: PolicyRule<number>;
  /** Cash left at close, so the company never closes at $0. */
  readonly closeBufferMonths: PolicyRule<number>;
  /** At or below this runway, raise now regardless of the schedule. */
  readonly raiseNowRunwayMonths: PolicyRule<number>;
  readonly roundToUsd: PolicyRule<number>;
  /** Inputs older than this are flagged stale and lower confidence. */
  readonly staleAfterDays: PolicyRule<number>;
}

/** Stated policy. Each rule names where it comes from. */
export const DEFAULT_FUNDRAISE_POLICY: FundraisePolicy = {
  runwayTargetMonths: {
    value: { min: 18, max: 24 },
    source:
      'min 18: Paul Graham, "How to Raise Money" (2013, paulgraham.com/fr.html), sizes a raise as monthly cost x 18 months. max 24: Jovie policy upper bound, common seed convention (not from PG).',
  },
  marginRate: {
    value: 0.25,
    source:
      'Trevor Blackwell, growth.tlb.org: "raise a comfortable margin above it". 25% is Jovie policy.',
  },
  fundraiseDurationMonths: {
    value: 3,
    source:
      'Jovie policy: plan three months from first meeting to wired cash for a seed SAFE.',
  },
  closeBufferMonths: {
    value: 2,
    source:
      'Jovie policy: close with two months of cash left, so the raise is never forced.',
  },
  raiseNowRunwayMonths: {
    value: 8,
    source:
      'Paul Graham, "The Fatal Pinch" (2015, paulgraham.com/pinch.html): "if you have 8 months of runway or less, ... try to get the money right now."',
  },
  roundToUsd: {
    value: 25_000,
    source: 'Jovie policy: state raise amounts rounded up to $25K.',
  },
  staleAfterDays: {
    value: 30,
    source: 'Jovie policy: finance inputs older than 30 days are stale.',
  },
};
