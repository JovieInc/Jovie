/**
 * Model-successor auto-routing policy with a spend guard (JOV-13153).
 *
 * Rule (relayed by Grok Bot from Tim, 2026-11-19 12:40 PM PT — **PENDING TIM
 * CONFIRMATION**: the rule and the +5% threshold are NOT yet confirmed in
 * Tim's own words to Symphony; nothing auto-switches until both the
 * confirmation and the event trigger land):
 *
 * When a covered flash-tier model (GLM 5.3 Flash or DeepSeek V4.1 Flash) has
 * a clear successor available — on Cloudflare or elsewhere — route to the
 * successor automatically without asking. The spend guard runs FIRST:
 * compare blended per-token cost (input + output weighted by our real usage
 * mix); switch only when the successor costs the same or less, or at most
 * +5% above the current model. If the successor would raise spend beyond
 * that, never switch silently — flag Tim with the price delta.
 *
 * Fail-closed semantics (the guard test pins each):
 * - successor pricing missing or unusable → refuse and flag (never switch on
 *   unknown cost);
 * - current pricing missing or unusable → refuse and flag (the delta cannot
 *   be computed, so it cannot be proven within budget);
 * - blended delta above the threshold → refuse and flag with the delta.
 *
 * Trigger: event-driven ONLY — Cloudflare changelog / deprecation notices or
 * model-catalog change events (repository_dispatch; the producer and the
 * workflow land via the Eve Runtime Owner's Mac/gh lane, proposed diff in the
 * JOV-13153 PR body). Never polling, never cron, no feature flag.
 *
 * This module is deliberately standalone (zero imports) so the decision is
 * pure, deterministic, and importable from anywhere — the unit test, a future
 * event evaluator, or a script. The config default is mirrored in
 * apps/web/lib/ai/routing.json `successorPolicy` (cross-checked by the test
 * so the mirror can never drift) and pointed at from
 * ops/models/task-registry.json `successorPolicy`.
 */

/**
 * Maximum acceptable blended per-token cost increase for an automatic
 * successor switch, in percent (Grok's working threshold — PENDING TIM
 * CONFIRMATION, JOV-13153). "At most +5%": the boundary itself switches.
 */
export const SUCCESSOR_SWITCH_MAX_DELTA_PCT = 5;

/**
 * Float tolerance when comparing the computed delta against the threshold,
 * so a mathematically-exact +5% (e.g. 0.20 → 0.21 blended) is not refused by
 * floating-point noise (0.21 - 0.20 is 5.000000000000005% in IEEE-754).
 */
export const SUCCESSOR_DELTA_EPSILON_PCT = 1e-9;

/** Policy lifecycle: encoded, but nothing routes on it until Tim confirms. */
export const SUCCESSOR_POLICY_STATUS =
  'draft-pending-tim-confirmation' as const;

/** A refused switch (or a missing-price refusal) is flagged to Tim only. */
export const SUCCESSOR_FLAG_RECIPIENT = 'Tim';

/**
 * The flash-tier models the rule covers, in their canonical ids: the Gateway
 * contract id for GLM 5.3 Flash and the current Workers AI twin for the
 * DeepSeek v4.1 flash tier.
 */
export const SUCCESSOR_POLICY_COVERED_MODELS = [
  'zai/glm-5.3-flash',
  '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
] as const;

/**
 * Default real-usage mix used to blend input and output prices: 20k input +
 * 1k output tokens per typical turn, from the task-registry costBasis
 * estimates (ops/models/task-registry.json, summer-turn and friends). An
 * evaluator with measured token counts should pass its own mix.
 */
export const DEFAULT_USAGE_MIX = {
  inputTokens: 20_000,
  outputTokens: 1_000,
} as const;

/** Per-million-token list pricing for one model. */
export interface ModelPricing {
  readonly inputUsdPerM: number;
  readonly outputUsdPerM: number;
}

/** Token counts that weight the input/output prices into one blended cost. */
export interface UsageMix {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** A successor candidate as an event would propose it. */
export interface SuccessorCandidate {
  readonly modelId: string;
  /** Catalog pricing; null when the event did not carry usable pricing. */
  readonly pricing: ModelPricing | null;
}

export type SuccessorSwitchDecision =
  | {
      readonly action: 'none';
      readonly reason: 'no-successor-candidate';
    }
  | {
      readonly action: 'switch';
      readonly currentBlendedUsdPerM: number;
      readonly successorBlendedUsdPerM: number;
      readonly blendedDeltaPct: number;
    }
  | {
      readonly action: 'refuse-and-flag';
      readonly flagTo: typeof SUCCESSOR_FLAG_RECIPIENT;
      readonly reason:
        | 'successor-pricing-missing'
        | 'current-pricing-missing'
        | 'usage-mix-invalid'
        | 'blended-increase-above-threshold';
      /** Null when pricing was missing and the delta could not be computed. */
      readonly blendedDeltaPct: number | null;
      readonly currentBlendedUsdPerM: number | null;
      readonly successorBlendedUsdPerM: number | null;
    };

function isUsablePricing(
  pricing: ModelPricing | null
): pricing is ModelPricing {
  return (
    pricing !== null &&
    Number.isFinite(pricing.inputUsdPerM) &&
    Number.isFinite(pricing.outputUsdPerM) &&
    pricing.inputUsdPerM > 0 &&
    pricing.outputUsdPerM > 0
  );
}

function isUsableMix(mix: UsageMix): boolean {
  return (
    Number.isFinite(mix.inputTokens) &&
    Number.isFinite(mix.outputTokens) &&
    mix.inputTokens > 0 &&
    mix.outputTokens > 0
  );
}

/**
 * Blended per-token cost in USD per 1M tokens, weighting input and output
 * list prices by the usage mix:
 * (inputTokens * inputUsdPerM + outputTokens * outputUsdPerM) / totalTokens.
 */
export function blendedUsdPerM(pricing: ModelPricing, mix: UsageMix): number {
  const total = mix.inputTokens + mix.outputTokens;
  return (
    (mix.inputTokens * pricing.inputUsdPerM +
      mix.outputTokens * pricing.outputUsdPerM) /
    total
  );
}

/**
 * Decide whether an automatic successor switch is allowed under the spend
 * guard. Pure and total: every input maps to exactly one decision, and every
 * refusal names its reason and flags Tim.
 */
export function decideSuccessorSwitch(input: {
  readonly currentPricing: ModelPricing | null;
  readonly successor: SuccessorCandidate | null;
  readonly usageMix?: UsageMix;
}): SuccessorSwitchDecision {
  if (input.successor === null) {
    return { action: 'none', reason: 'no-successor-candidate' };
  }
  if (!isUsablePricing(input.successor.pricing)) {
    return {
      action: 'refuse-and-flag',
      flagTo: SUCCESSOR_FLAG_RECIPIENT,
      reason: 'successor-pricing-missing',
      blendedDeltaPct: null,
      currentBlendedUsdPerM: null,
      successorBlendedUsdPerM: null,
    };
  }
  if (!isUsablePricing(input.currentPricing)) {
    return {
      action: 'refuse-and-flag',
      flagTo: SUCCESSOR_FLAG_RECIPIENT,
      reason: 'current-pricing-missing',
      blendedDeltaPct: null,
      currentBlendedUsdPerM: null,
      successorBlendedUsdPerM: null,
    };
  }
  const mix = input.usageMix ?? DEFAULT_USAGE_MIX;
  if (!isUsableMix(mix)) {
    return {
      action: 'refuse-and-flag',
      flagTo: SUCCESSOR_FLAG_RECIPIENT,
      reason: 'usage-mix-invalid',
      blendedDeltaPct: null,
      currentBlendedUsdPerM: null,
      successorBlendedUsdPerM: null,
    };
  }
  const currentBlended = blendedUsdPerM(input.currentPricing, mix);
  const successorBlended = blendedUsdPerM(input.successor.pricing, mix);
  const blendedDeltaPct =
    ((successorBlended - currentBlended) / currentBlended) * 100;
  if (
    blendedDeltaPct >
    SUCCESSOR_SWITCH_MAX_DELTA_PCT + SUCCESSOR_DELTA_EPSILON_PCT
  ) {
    return {
      action: 'refuse-and-flag',
      flagTo: SUCCESSOR_FLAG_RECIPIENT,
      reason: 'blended-increase-above-threshold',
      blendedDeltaPct,
      currentBlendedUsdPerM: currentBlended,
      successorBlendedUsdPerM: successorBlended,
    };
  }
  return {
    action: 'switch',
    currentBlendedUsdPerM: currentBlended,
    successorBlendedUsdPerM: successorBlended,
    blendedDeltaPct,
  };
}
