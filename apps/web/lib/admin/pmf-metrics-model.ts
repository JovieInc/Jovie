/**
 * Product-market-fit read-out for admitted users (pure math, no I/O).
 *
 * - Activation rate: admitted users who activated, over admitted users.
 *   Both use lib/activation/admitted-activation, the founder funnel's
 *   definitions.
 * - Very disappointed rate: Sean Ellis survey answers of "very
 *   disappointed" over all answers, read against the 40% PMF bar.
 */

export const PMF_VERY_DISAPPOINTED_TARGET = 0.4;

export interface PmfMetricCounts {
  readonly admittedUsers: number;
  readonly activatedUsers: number;
  readonly surveyResponses: number;
  readonly veryDisappointed: number;
}

export interface PmfMetrics extends PmfMetricCounts {
  /** Null when no user is admitted yet. */
  readonly activationRate: number | null;
  /** Null when nobody has answered yet. */
  readonly veryDisappointedRate: number | null;
  readonly target: number;
  /** Null until there is at least one answer. */
  readonly meetsTarget: boolean | null;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0
    ? Math.min(numerator, denominator) / denominator
    : null;
}

export function computePmfMetrics(counts: PmfMetricCounts): PmfMetrics {
  const admittedUsers = safeCount(counts.admittedUsers);
  const activatedUsers = safeCount(counts.activatedUsers);
  const surveyResponses = safeCount(counts.surveyResponses);
  const veryDisappointed = safeCount(counts.veryDisappointed);
  const veryDisappointedRate = rate(veryDisappointed, surveyResponses);
  return {
    admittedUsers,
    activatedUsers,
    surveyResponses,
    veryDisappointed,
    activationRate: rate(activatedUsers, admittedUsers),
    veryDisappointedRate,
    target: PMF_VERY_DISAPPOINTED_TARGET,
    meetsTarget:
      veryDisappointedRate === null
        ? null
        : veryDisappointedRate >= PMF_VERY_DISAPPOINTED_TARGET,
  };
}
