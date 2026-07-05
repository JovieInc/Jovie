/**
 * Pure promotion math for per-workflow model bake-offs (GH #11462).
 *
 * Quality signal: 👍/👎 up-rate per arm (feedback_items.vote grouped by
 * model_used). Significance: one-sided two-proportion z-test — conservative
 * enough at the vote volumes we expect, no dependency needed
 * (adopt > wrap > build: this is ~20 lines of math, not a stats library).
 */

export interface ArmStats {
  readonly model: string;
  readonly upVotes: number;
  readonly downVotes: number;
  /** Average estimated USD per request; null when the model is unpriced. */
  readonly avgCostUsd: number | null;
  /** Average total tokens per request; cost fallback when unpriced. */
  readonly avgTotalTokens: number | null;
}

export type PromotionVerdict =
  /** Challenger is significantly better and cost-eligible → auto-promote. */
  | { readonly kind: 'promote'; readonly winner: string }
  /** Challenger wins on quality but is materially more expensive → Tim. */
  | { readonly kind: 'needs_decision'; readonly winner: string }
  /** Not enough evidence yet (sample or significance) → keep splitting. */
  | { readonly kind: 'hold'; readonly reason: string };

export interface PromotionDecisionInput {
  /** Arms in candidate order: index 0 is the control model. */
  readonly arms: readonly ArmStats[];
  readonly minVotesPerArm: number;
  /** Challenger avg cost must be <= control * (1 + costTolerance). */
  readonly costTolerance: number;
}

/** One-sided significance threshold (p < 0.05). */
export const PROMOTION_Z_THRESHOLD = 1.645;

function totalVotes(arm: ArmStats): number {
  return arm.upVotes + arm.downVotes;
}

function upRate(arm: ArmStats): number {
  const n = totalVotes(arm);
  return n > 0 ? arm.upVotes / n : 0;
}

/**
 * One-sided two-proportion z-score for challenger up-rate > control up-rate.
 * Returns 0 when the pooled variance degenerates (all-same outcomes).
 */
export function twoProportionZ(
  challenger: ArmStats,
  control: ArmStats
): number {
  const n1 = totalVotes(challenger);
  const n2 = totalVotes(control);
  if (n1 === 0 || n2 === 0) return 0;

  const p1 = upRate(challenger);
  const p2 = upRate(control);
  const pooled = (challenger.upVotes + control.upVotes) / (n1 + n2);
  const variance = pooled * (1 - pooled) * (1 / n1 + 1 / n2);
  if (variance <= 0) return 0;

  return (p1 - p2) / Math.sqrt(variance);
}

/**
 * Is the challenger's cost equal-or-cheaper (within tolerance)?
 * Prefers estimated USD; falls back to avg tokens when either model is
 * unpriced; treats missing data on both sides as cost-neutral (quality
 * signal alone then decides, logged in the evidence).
 */
export function isCostEligible(
  challenger: ArmStats,
  control: ArmStats,
  costTolerance: number
): boolean {
  const budgetFactor = 1 + Math.max(0, costTolerance);
  if (challenger.avgCostUsd != null && control.avgCostUsd != null) {
    return challenger.avgCostUsd <= control.avgCostUsd * budgetFactor;
  }
  if (challenger.avgTotalTokens != null && control.avgTotalTokens != null) {
    return challenger.avgTotalTokens <= control.avgTotalTokens * budgetFactor;
  }
  // No comparable cost data — do not block promotion on it, but callers
  // record this in evidence so the audit trail shows the gap.
  return true;
}

/**
 * Decide whether any challenger should be promoted over the control arm.
 *
 * Rules (issue #11462):
 *  - every compared arm needs >= minVotesPerArm votes;
 *  - challenger must beat control at one-sided p < 0.05;
 *  - equal-or-cheaper cost → auto-promote;
 *  - significantly better but materially more expensive → needs_decision
 *    (escalate to Tim, never auto-promote on cost regressions).
 */
export function decidePromotion(
  input: PromotionDecisionInput
): PromotionVerdict {
  const { arms, minVotesPerArm, costTolerance } = input;
  if (arms.length < 2) {
    return { kind: 'hold', reason: 'fewer than 2 arms' };
  }

  const control = arms[0]!;
  if (totalVotes(control) < minVotesPerArm) {
    return {
      kind: 'hold',
      reason: `control has ${totalVotes(control)}/${minVotesPerArm} votes`,
    };
  }

  // Best significant challenger by up-rate.
  let best: ArmStats | null = null;
  for (const challenger of arms.slice(1)) {
    if (totalVotes(challenger) < minVotesPerArm) continue;
    const z = twoProportionZ(challenger, control);
    if (z < PROMOTION_Z_THRESHOLD) continue;
    if (!best || upRate(challenger) > upRate(best)) {
      best = challenger;
    }
  }

  if (!best) {
    return {
      kind: 'hold',
      reason: 'no challenger is significantly better than control yet',
    };
  }

  return isCostEligible(best, control, costTolerance)
    ? { kind: 'promote', winner: best.model }
    : { kind: 'needs_decision', winner: best.model };
}

/** Serializable decision evidence for the model_promotions audit log. */
export function buildEvidence(
  arms: readonly ArmStats[],
  control: ArmStats
): Record<string, unknown> {
  return {
    arms: arms.map(arm => ({
      model: arm.model,
      upVotes: arm.upVotes,
      downVotes: arm.downVotes,
      upRate: Number(upRate(arm).toFixed(4)),
      avgCostUsd: arm.avgCostUsd,
      avgTotalTokens: arm.avgTotalTokens,
      zVsControl:
        arm.model === control.model
          ? null
          : Number(twoProportionZ(arm, control).toFixed(3)),
    })),
    zThreshold: PROMOTION_Z_THRESHOLD,
  };
}
