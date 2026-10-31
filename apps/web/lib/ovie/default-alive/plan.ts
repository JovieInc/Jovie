import type { FundraisePolicy } from './policy';

/**
 * Use of funds. Current burn measures survival; a raise funds a plan. Each
 * line is a planned monthly cost with its source, or an explicit assumption
 * with a default the founder can change.
 */

export interface UseOfFundsLine {
  readonly label: string;
  readonly usdPerMonth: number;
  readonly source: string;
  readonly basis:
    | 'assumption'
    | 'founder-attested'
    | 'measured'
    | 'registry-cap';
}

export interface RaisePlan {
  /** The milestone the raise must reach, e.g. "10 paying artists, $5K MRR". */
  readonly milestone: string;
  /** Months from close to the milestone. */
  readonly milestoneMonths: number;
  readonly milestoneSource: string;
  readonly lines: readonly UseOfFundsLine[];
  /** A fixed offer to test against the plan (e.g. a program's standard check). */
  readonly offer?: { readonly usd: number; readonly source: string } | null;
}

export interface PlanEvaluation {
  readonly milestone: string;
  /** Milestone months plus the time to raise the next round and a buffer. */
  readonly months: number;
  readonly monthlyBurnUsd: number;
  readonly grossCostUsd: number;
  /** grossCostUsd x (1 + margin). Revenue is not netted: conservative. */
  readonly withMarginUsd: number;
  readonly offerUsd: number | null;
  /** Months the offer funds at planned burn. */
  readonly offerRunwayMonths: number | null;
  readonly offerCoversPlan: boolean | null;
  /** Months of offer runway left after the milestone, to raise the next round. */
  readonly offerMonthsAfterMilestone: number | null;
  /** Offer lasts through the milestone plus raise time and buffer. */
  readonly offerReachesMilestoneWithRaiseTime: boolean | null;
  /** Lines that are assumptions, for the founder to confirm or change. */
  readonly assumptions: readonly string[];
}

export function evaluatePlan(
  plan: RaisePlan,
  policy: FundraisePolicy
): PlanEvaluation | null {
  const valid =
    plan.milestoneMonths > 0 &&
    plan.lines.length > 0 &&
    plan.lines.every(
      line => Number.isFinite(line.usdPerMonth) && line.usdPerMonth >= 0
    );
  if (!valid) return null;
  const monthlyBurnUsd = plan.lines.reduce(
    (sum, line) => sum + line.usdPerMonth,
    0
  );
  // The plan must also carry the company through raising the next round.
  const months =
    plan.milestoneMonths +
    policy.fundraiseDurationMonths.value +
    policy.closeBufferMonths.value;
  const grossCostUsd = monthlyBurnUsd * months;
  const withMarginUsd = grossCostUsd * (1 + policy.marginRate.value);
  const offerUsd = plan.offer?.usd ?? null;
  const offerRunwayMonths =
    offerUsd !== null && monthlyBurnUsd > 0 ? offerUsd / monthlyBurnUsd : null;
  return {
    milestone: plan.milestone,
    months,
    monthlyBurnUsd: Math.round(monthlyBurnUsd),
    grossCostUsd: Math.round(grossCostUsd),
    withMarginUsd: Math.round(withMarginUsd),
    offerUsd,
    offerRunwayMonths:
      offerRunwayMonths === null
        ? null
        : Math.round(offerRunwayMonths * 10) / 10,
    offerCoversPlan: offerUsd === null ? null : offerUsd >= withMarginUsd,
    offerMonthsAfterMilestone:
      offerRunwayMonths === null
        ? null
        : Math.round((offerRunwayMonths - plan.milestoneMonths) * 10) / 10,
    offerReachesMilestoneWithRaiseTime:
      offerRunwayMonths === null ? null : offerRunwayMonths >= months,
    assumptions: plan.lines
      .filter(line => line.basis === 'assumption')
      .map(line => `${line.label}: ${line.usdPerMonth}/mo (${line.source})`),
  };
}
