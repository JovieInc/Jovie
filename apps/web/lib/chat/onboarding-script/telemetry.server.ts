import 'server-only';
import { trackServerEvent } from '@/lib/server-analytics';
import type { IntentClassification } from './classifier';

/**
 * Per-reply onboarding telemetry (JOV-9627).
 *
 * One `onboarding_reply` row per assistant turn: which engine answered, the
 * rail step, the intent and confidence, the script line, the plan decision if
 * the turn offered one, and the server time from request entry to the first
 * byte of reply. Rows key on the onboarding `session_id`, which joins to the
 * conversation, the claimed user, and later checkout and payment events, so
 * the value funnel (step reached, plan offered, plan chosen, paid) and its
 * p50/p95 latency are computable per user. Never throws and never awaits on
 * the reply path.
 */

export type OnboardingReplyEngine = 'system1' | 'llm';

export interface OnboardingReplyTelemetry {
  readonly sessionId: string;
  readonly engine: OnboardingReplyEngine;
  readonly guardedStep: string;
  readonly turnIndex: number;
  readonly serverMs: number;
  readonly classification?: IntentClassification | null;
  readonly lineKey?: string | null;
  /** `instant_access` | `waitlist` when the turn offered a plan. */
  readonly decisionKind?: string | null;
  /** Set when the LLM path failed over to the script. */
  readonly fallback?: string | null;
}

export function recordOnboardingReply(input: OnboardingReplyTelemetry): void {
  void trackServerEvent('onboarding_reply', {
    session_id: input.sessionId,
    engine: input.engine,
    guarded_step: input.guardedStep,
    reply_intent: input.classification?.intent ?? null,
    classifier: input.classification?.source ?? null,
    line_key: input.lineKey ?? null,
    decision_kind: input.decisionKind ?? null,
    confidence: input.classification
      ? Math.round(input.classification.confidence * 100) / 100
      : null,
    server_ms: Math.round(input.serverMs),
    turn_index: input.turnIndex,
    fallback: input.fallback ?? null,
  }).catch(() => undefined);
}

/** Pull the plan decision kind out of a turn's tool events, if any. */
export function decisionKindOf(
  toolEvents: readonly { output: Record<string, unknown> }[]
): string | null {
  for (const event of toolEvents) {
    const decision = event.output.decision;
    if (
      typeof decision === 'object' &&
      decision !== null &&
      typeof (decision as { kind?: unknown }).kind === 'string'
    ) {
      return (decision as { kind: string }).kind;
    }
  }
  return null;
}
