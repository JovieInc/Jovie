/**
 * One deterministic qualification decision (Tim, 2026-11-09 — Mom Test funnel).
 *
 * Unifies the existing decision pieces instead of forking them:
 *  - `decideGoldenPathAdmission` (lib/waitlist/golden-path-admission.ts) —
 *    its hold_* reasons map to `queued`.
 *  - `qualificationReceipt` / `decideConversationOutcome`
 *    (lib/acquisition/conversation-loop.ts) — Mom Test coverage,
 *    disqualifiers, needs-you routing.
 *  - `evaluateAccessSignal` / `decideOnboardingAccess`
 *    (lib/chat/tools/onboarding-access-eval.ts) — the onboarding gate.
 *  - Role-form answers (waitlist-qualifying.ts + qualifyRoleEntrant in the
 *    join route).
 *
 * Pure and shared: the join route and the onboarding chat both call this, so
 * what a person is told and what the record says cannot drift. The admission
 * score only ranks — it never decides (admission-score v1 rule).
 */
import {
  CONVERSATION_LOOP_CONTRACT,
  type ConversationDecisionResult,
  type MomTestDimension,
  type QualificationReceipt,
  qualificationReceipt,
} from '@/lib/acquisition/conversation-loop';
import {
  decideGoldenPathAdmission,
  type GoldenPathAdmissionInput,
  type GoldenPathAdmissionReason,
} from '@/lib/waitlist/golden-path-admission';

export const QUALIFICATION_RULE_VERSION = 'qualify/2026-11-v1' as const;

export type QualificationOutcomeKind =
  | 'qualified'
  | 'queued'
  | 'disqualified'
  | 'request_evidence';

export type QualificationDecisionReason =
  | GoldenPathAdmissionReason
  | `disqualified_${string}`
  | `needs_you_${string}`
  | `missing_${string}`
  | 'needs_capture_incomplete'
  | 'conversation_disqualify'
  | 'mom_test_full_coverage'
  | 'golden_path_admit';

export interface ExtractedCapabilityWant {
  readonly kind: 'want' | 'objection' | 'current_tool';
  /** Their words, verbatim. Never agent paraphrase. */
  readonly text: string;
  /** Feature-registry capability key when one clearly applies; else null. */
  readonly capabilityKey: string | null;
  readonly sourceTurnId: string | null;
}

export interface QualificationDecision {
  readonly ruleVersion: typeof QUALIFICATION_RULE_VERSION;
  readonly contract: typeof CONVERSATION_LOOP_CONTRACT;
  readonly outcome: QualificationOutcomeKind;
  readonly reason: QualificationDecisionReason;
  /** Needs/objections/current tools captured at decision time, their words. */
  readonly wants: readonly ExtractedCapabilityWant[];
}

export interface DecideQualificationInput {
  /** Server-resolved golden-path inputs; omit when there is no artist read. */
  readonly goldenPath?: GoldenPathAdmissionInput | null;
  /** Capacity/throttle hold resolved by the caller; wins over an admit. */
  readonly goldenPathHold?: GoldenPathAdmissionReason | null;
  /** Shared Mom Test receipt for everything captured so far. */
  readonly receipt: QualificationReceipt;
  /**
   * The captured Mom Test answers themselves (their words), used to extract
   * capability wants. Same object the receipt was built from.
   */
  readonly answers?: Partial<Record<MomTestDimension, string>>;
  /** Conversation-loop verdict for chat-channel entrants. */
  readonly conversation?: Pick<
    ConversationDecisionResult,
    'decision' | 'needsYouReasons'
  > | null;
  /** Evidence turn refs keyed by dimension, for capability_wants provenance. */
  readonly evidenceTurnIds?: Partial<Record<MomTestDimension, string>>;
  /** True when the interview hit the turn cap and capture is over. */
  readonly turnCapReached?: boolean;
}

/**
 * The decision table. Order matters and every branch is deterministic:
 * disqualifiers first, then golden-path admit, then holds, then needs-you,
 * then Mom Test coverage.
 */
export function decideQualification(
  input: DecideQualificationInput
): QualificationDecision {
  const wants = extractCapabilityWants(input);

  // 1. A stated disqualifier is an honest no — with the reason recorded.
  const disqualifier = input.receipt.disqualifiers[0];
  if (disqualifier) {
    return decision('disqualified', `disqualified_${disqualifier}`, wants);
  }

  // 2. Golden path green (identity resolved, not high-profile) admits with
  //    proof still required at claim time.
  if (input.goldenPath) {
    const admission = decideGoldenPathAdmission(input.goldenPath);
    if (admission.admit && !input.goldenPathHold) {
      return decision('qualified', 'golden_path_admit', wants);
    }
    if (admission.admit && input.goldenPathHold) {
      return decision('queued', input.goldenPathHold, wants);
    }
  }

  // 3. Any hold (cone not green, capacity full, auto-accept off, high-profile
  //    verification) is OUR readiness, never their disqualification.
  if (input.goldenPathHold) {
    return decision('queued', input.goldenPathHold, wants);
  }

  // 4. Judgment-required conversations route to a human, held as queued.
  if (input.conversation?.decision === 'needs_you') {
    const reason = input.conversation.needsYouReasons[0] ?? 'high_value';
    return decision('queued', `needs_you_${reason}`, wants);
  }
  if (input.conversation?.decision === 'disqualify') {
    return decision('disqualified', 'conversation_disqualify', wants);
  }

  // 5. Full Mom Test coverage with no disqualifier qualifies.
  if (input.receipt.missingDimensions.length === 0) {
    return decision('qualified', 'mom_test_full_coverage', wants);
  }

  // 6. Capture is over but the picture is incomplete — that is our turn
  //    budget, not their fault, so hold them queued with needs stored.
  if (input.turnCapReached) {
    return decision('queued', 'needs_capture_incomplete', wants);
  }

  // 7. Not enough signal yet — ask about the missing dimensions.
  const missing = input.receipt.missingDimensions.join('|');
  return decision('request_evidence', `missing_${missing}`, wants);
}

function decision(
  outcome: QualificationOutcomeKind,
  reason: QualificationDecisionReason,
  wants: readonly ExtractedCapabilityWant[]
): QualificationDecision {
  return {
    ruleVersion: QUALIFICATION_RULE_VERSION,
    contract: CONVERSATION_LOOP_CONTRACT,
    outcome,
    reason,
    wants,
  };
}

function extractCapabilityWants(
  input: DecideQualificationInput
): readonly ExtractedCapabilityWant[] {
  const wants: ExtractedCapabilityWant[] = [];
  const covered = new Set(input.receipt.coveredDimensions);
  for (const dimension of Object.keys(
    input.answers ?? {}
  ) as MomTestDimension[]) {
    const text = (input.answers?.[dimension] ?? '').trim();
    if (!text || !covered.has(dimension)) continue;
    wants.push({
      kind: kindForDimension(dimension),
      text,
      capabilityKey: null,
      sourceTurnId: input.evidenceTurnIds?.[dimension] ?? null,
    });
  }
  return wants;
}

function kindForDimension(
  dimension: MomTestDimension
): ExtractedCapabilityWant['kind'] {
  switch (dimension) {
    case 'alternatives':
    case 'current_behavior':
      return 'current_tool';
    case 'pain':
      return 'objection';
    default:
      return 'want';
  }
}

/* ------------------------------------------------------------------ */
/* Role-form adapter                                                   */
/* ------------------------------------------------------------------ */

/**
 * Role-form Mom Test answers (request-access form) → decision. The form
 * captures two past-behavior questions; both answered qualifies, anything
 * less is request_evidence naming the gap. The admission score never
 * participates: it ranks, it never decides (admission-score v1 rule).
 */
export interface RoleFormDecisionInput {
  readonly lastGrowthAttempt?: string | null;
  readonly promoSpend?: string | null;
}

export function decideRoleFormQualification(
  input: RoleFormDecisionInput
): QualificationDecision {
  const lastGrowthAttempt = (input.lastGrowthAttempt ?? '').trim();
  const promoSpend = (input.promoSpend ?? '').trim();
  const answers = {
    ...(lastGrowthAttempt ? { current_behavior: lastGrowthAttempt } : {}),
    ...(promoSpend ? { spend: promoSpend } : {}),
  };
  const receipt = qualificationReceipt({
    answers,
    evidence: [],
    hasCurrentSpend: Boolean(promoSpend),
    hasAuthority: true,
    hasConcreteUrgency: false,
  });
  const decision = decideQualification({
    receipt,
    answers: {
      // Only free-text answers become capability wants; the spend band is a
      // tap, not their words.
      ...(lastGrowthAttempt ? { current_behavior: lastGrowthAttempt } : {}),
    },
  });
  // The role form cannot ask follow-ups, so request_evidence entries keep
  // status `new` (pending review) with the gap recorded as decisionReason.
  return decision;
}

/** Waitlist status for a role-form decision outcome. */
export function roleFormOutcomeToStatus(
  outcome: QualificationOutcomeKind
): 'qualified' | 'queued' | 'disqualified' | 'new' {
  switch (outcome) {
    case 'qualified':
      return 'qualified';
    case 'queued':
      return 'queued';
    case 'disqualified':
      return 'disqualified';
    default:
      return 'new';
  }
}
