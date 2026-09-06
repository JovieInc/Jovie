export interface OptimizationDecisionInput {
  readonly status: 'draft' | 'running' | 'paused' | 'decided' | 'cancelled';
  readonly objective: string;
  readonly guardrails: Record<string, unknown>;
  readonly variants: readonly { readonly key: string }[];
  readonly winnerVariantKey: string | null;
  readonly evidence: {
    readonly sampleSize: number;
    readonly minimumSampleSize: number;
    readonly windowStart: Date | null;
    readonly windowEnd: Date | null;
  };
  readonly acceptedBy: string | null;
}

export type OptimizationDecisionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'experiment_not_running'
        | 'objective_missing'
        | 'guardrails_missing'
        | 'winner_invalid'
        | 'measurement_window_missing'
        | 'sample_insufficient'
        | 'acceptance_missing';
    };

export function validateOptimizationDecision(
  input: OptimizationDecisionInput
): OptimizationDecisionResult {
  if (input.status !== 'running') {
    return { ok: false, reason: 'experiment_not_running' };
  }
  if (!input.objective.trim()) {
    return { ok: false, reason: 'objective_missing' };
  }
  if (Object.keys(input.guardrails).length === 0) {
    return { ok: false, reason: 'guardrails_missing' };
  }
  if (
    !input.winnerVariantKey ||
    !input.variants.some(variant => variant.key === input.winnerVariantKey)
  ) {
    return { ok: false, reason: 'winner_invalid' };
  }
  if (!input.evidence.windowStart || !input.evidence.windowEnd) {
    return { ok: false, reason: 'measurement_window_missing' };
  }
  if (input.evidence.sampleSize < input.evidence.minimumSampleSize) {
    return { ok: false, reason: 'sample_insufficient' };
  }
  if (!input.acceptedBy) {
    return { ok: false, reason: 'acceptance_missing' };
  }
  return { ok: true };
}
