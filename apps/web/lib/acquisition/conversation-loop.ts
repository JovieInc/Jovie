/**
 * JOV-5947 — conversation-native commitment → payment → provisioning →
 * activation loop policy on the JOV-5911 kernel.
 *
 * Channel adapters (Photon/iMessage, landing tap/QR, public social) call these
 * pure evaluators; they must not own a second lead state machine. Durable
 * state stays in the leads/waitlist funnel stores; judgment-required outcomes
 * route to the universal Ovi `Needs You` surface, not an acquisition inbox.
 */

import type { AcquisitionState } from './kernel';

export const CONVERSATION_LOOP_CONTRACT = 'jovie.conversation-loop/v1' as const;

export const CONVERSATION_ENTRY_SURFACES = [
  'landing_tap',
  'landing_qr',
  'direct_imessage',
  'existing_customer_thread',
  'public_mention',
  'public_dm',
  'public_comment',
] as const;
export type ConversationEntrySurface =
  (typeof CONVERSATION_ENTRY_SURFACES)[number];

export const PUBLIC_ENTRY_SURFACES: readonly ConversationEntrySurface[] = [
  'public_mention',
  'public_dm',
  'public_comment',
];

export function isPublicEntrySurface(
  surface: ConversationEntrySurface
): boolean {
  return PUBLIC_ENTRY_SURFACES.includes(surface);
}

/* ------------------------------------------------------------------ */
/* 1. Identity and consent                                             */
/* ------------------------------------------------------------------ */

export type IdentityAuthority =
  | 'verified_account'
  | 'contact_evidence'
  | 'ambiguous';

export interface ConversationIdentityInput {
  readonly surface: ConversationEntrySurface;
  /** Canonical conversation/thread id from the channel, if any. */
  readonly threadId?: string | null;
  /** E.164 phone or platform handle evidence from the inbound message. */
  readonly phone?: string | null;
  readonly handle?: string | null;
  /** Existing account id when the sender is a known customer. */
  readonly accountId?: string | null;
  /** Signed landing intent token / referral attribution, when present. */
  readonly intentToken?: string | null;
  /** Existing prospect/lead ids already resolved for this evidence. */
  readonly existingProspectIds?: readonly string[];
}

export interface ConversationIdentityResolution {
  /** One durable prospect key; deduped across channels. */
  readonly prospectKey: string;
  readonly authority: IdentityAuthority;
  readonly deduplicated: boolean;
  /**
   * True when phone/handle evidence is not enough to prove account authority
   * and the thread must confirm before privileged actions.
   */
  readonly requiresConfirmation: boolean;
  /** Public surfaces always confirm authority before acting. */
  readonly publicSurface: boolean;
}

export function resolveConversationIdentity(
  input: ConversationIdentityInput
): ConversationIdentityResolution {
  const existing = input.existingProspectIds ?? [];
  const deduplicated = existing.length > 0;
  const publicSurface = isPublicEntrySurface(input.surface);

  const authority: IdentityAuthority = input.accountId
    ? 'verified_account'
    : input.phone || input.handle
      ? 'contact_evidence'
      : 'ambiguous';

  const prospectKey =
    input.accountId ??
    (deduplicated ? existing[0] : undefined) ??
    input.threadId ??
    input.phone ??
    input.handle ??
    'anonymous';

  return {
    prospectKey: `${input.surface}:${prospectKey}`,
    authority,
    deduplicated,
    requiresConfirmation:
      publicSurface ||
      authority === 'ambiguous' ||
      (authority === 'contact_evidence' && !input.threadId),
    publicSurface,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Mom Test qualification                                           */
/* ------------------------------------------------------------------ */

export const MOM_TEST_DIMENSIONS = [
  'current_behavior',
  'pain',
  'spend',
  'urgency',
  'alternatives',
  'desired_outcome',
] as const;
export type MomTestDimension = (typeof MOM_TEST_DIMENSIONS)[number];

/**
 * Patterns that signal a leading or vanity-intent question. The agent must not
 * ask these; qualification scores stated behavior, not enthusiasm.
 */
const LEADING_QUESTION_PATTERNS: readonly RegExp[] = [
  /would you (pay|buy|use|try|sign up)/i,
  /do you (like|love|want)/i,
  /how much would you/i,
  /are you interested in/i,
  /does that sound (good|useful|helpful)/i,
  /will you (pay|buy|use)/i,
];

export function isLeadingQuestion(question: string): boolean {
  return LEADING_QUESTION_PATTERNS.some(pattern => pattern.test(question));
}

export interface QualificationEvidenceRef {
  /** Privacy-safe pointer into the canonical thread (turn id, not raw text). */
  readonly threadTurnId: string;
  readonly dimension: MomTestDimension;
}

export interface QualificationInput {
  readonly answers: Partial<Record<MomTestDimension, string>>;
  readonly evidence: readonly QualificationEvidenceRef[];
  /** Concrete observed disqualifiers (no budget, no authority, wrong ICP). */
  readonly disqualifiers?: readonly string[];
  /** Prospect stated a concrete current spend or paid alternative. */
  readonly hasCurrentSpend: boolean;
  /** Prospect can authorize a purchase without another approver. */
  readonly hasAuthority: boolean;
  /** Urgency is time-bound (launch date, deadline), not vague interest. */
  readonly hasConcreteUrgency: boolean;
}

export type RecommendedNextAction =
  | 'commitment_payment'
  | 'commitment_deposit'
  | 'commitment_session'
  | 'request_evidence'
  | 'disqualify'
  | 'needs_you';

export interface QualificationReceipt {
  readonly contract: typeof CONVERSATION_LOOP_CONTRACT;
  readonly coveredDimensions: readonly MomTestDimension[];
  readonly missingDimensions: readonly MomTestDimension[];
  readonly disqualifiers: readonly string[];
  readonly willingnessToPay: 'demonstrated' | 'stated' | 'unknown';
  readonly recommendedNextAction: RecommendedNextAction;
  /** 0..1 heuristic confidence; evidence-backed coverage raises it. */
  readonly confidence: number;
  readonly evidenceRefs: readonly QualificationEvidenceRef[];
}

export function qualificationReceipt(
  input: QualificationInput
): QualificationReceipt {
  const covered = MOM_TEST_DIMENSIONS.filter(
    dimension => (input.answers[dimension] ?? '').trim().length > 0
  );
  const missing = MOM_TEST_DIMENSIONS.filter(
    dimension => !covered.includes(dimension)
  );
  const disqualifiers = input.disqualifiers ?? [];

  const willingnessToPay: QualificationReceipt['willingnessToPay'] =
    input.hasCurrentSpend
      ? 'demonstrated'
      : covered.includes('spend')
        ? 'stated'
        : 'unknown';

  const coverage = covered.length / MOM_TEST_DIMENSIONS.length;
  const evidenceBacked = new Set(input.evidence.map(e => e.dimension));
  const evidenceCoverage =
    covered.filter(d => evidenceBacked.has(d)).length /
    MOM_TEST_DIMENSIONS.length;
  const confidence =
    Math.round((coverage * 0.6 + evidenceCoverage * 0.4) * 100) / 100;

  let recommendedNextAction: RecommendedNextAction;
  if (disqualifiers.length > 0) {
    recommendedNextAction = 'disqualify';
  } else if (!input.hasAuthority) {
    recommendedNextAction = 'needs_you';
  } else if (missing.length > 0) {
    recommendedNextAction = 'request_evidence';
  } else if (willingnessToPay === 'demonstrated' && input.hasConcreteUrgency) {
    recommendedNextAction = 'commitment_payment';
  } else if (willingnessToPay === 'demonstrated') {
    recommendedNextAction = 'commitment_deposit';
  } else {
    recommendedNextAction = 'commitment_session';
  }

  return {
    contract: CONVERSATION_LOOP_CONTRACT,
    coveredDimensions: covered,
    missingDimensions: missing,
    disqualifiers,
    willingnessToPay,
    recommendedNextAction,
    confidence,
    evidenceRefs: input.evidence,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Commitment experiment                                            */
/* ------------------------------------------------------------------ */

export const COMMITMENT_EXPERIMENTS = [
  'payment',
  'refundable_deposit',
  'paid_pilot',
  'signed_order',
  'setup_effort',
  'scheduled_session',
] as const;
export type CommitmentExperiment = (typeof COMMITMENT_EXPERIMENTS)[number];

/**
 * Ordered from strongest to weakest demand signal. The policy picks the
 * smallest ethical test the qualification supports — never a stronger ask
 * than the evidence justifies.
 */
const COMMITMENT_STRENGTH: readonly CommitmentExperiment[] = [
  'payment',
  'refundable_deposit',
  'paid_pilot',
  'signed_order',
  'setup_effort',
  'scheduled_session',
];

export function selectCommitmentExperiment(
  receipt: QualificationReceipt
): CommitmentExperiment | null {
  switch (receipt.recommendedNextAction) {
    case 'commitment_payment':
      return receipt.confidence >= 0.8 ? 'payment' : 'refundable_deposit';
    case 'commitment_deposit':
      return 'refundable_deposit';
    case 'commitment_session':
      return receipt.willingnessToPay === 'stated'
        ? 'setup_effort'
        : 'scheduled_session';
    default:
      return null;
  }
}

export function commitmentStrengthRank(
  experiment: CommitmentExperiment
): number {
  return COMMITMENT_STRENGTH.indexOf(experiment);
}

/* ------------------------------------------------------------------ */
/* 4. Payment-link truth                                               */
/* ------------------------------------------------------------------ */

export const PAYMENT_LINK_STATES = [
  'sent',
  'opened',
  'attempted',
  'paid',
  'failed',
  'refunded',
  'disputed',
  'expired',
] as const;
export type PaymentLinkState = (typeof PAYMENT_LINK_STATES)[number];

const PAYMENT_LINK_NEXT: Record<PaymentLinkState, readonly PaymentLinkState[]> =
  {
    sent: ['opened', 'attempted', 'expired'],
    opened: ['attempted', 'expired'],
    attempted: ['paid', 'failed'],
    paid: ['refunded', 'disputed'],
    failed: ['attempted', 'expired'],
    refunded: [],
    disputed: [],
    expired: [],
  };

export function reconcilePaymentLinkState(
  from: PaymentLinkState,
  to: PaymentLinkState
): { readonly ok: boolean; readonly state: PaymentLinkState } {
  const ok = from === to || PAYMENT_LINK_NEXT[from].includes(to);
  return { ok, state: ok ? to : from };
}

/** Terms that must be explicit before any payment/deposit link is sent. */
export const REQUIRED_PAYMENT_TERMS = [
  'price',
  'fulfillment_condition',
  'refund_policy',
  'cancel_policy',
  'timing',
] as const;
export type RequiredPaymentTerm = (typeof REQUIRED_PAYMENT_TERMS)[number];

export function paymentTermsComplete(
  terms: Partial<Record<RequiredPaymentTerm, string>>
): {
  readonly complete: boolean;
  readonly missing: readonly RequiredPaymentTerm[];
} {
  const missing = REQUIRED_PAYMENT_TERMS.filter(
    term => !(terms[term] ?? '').trim()
  );
  return { complete: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ */
/* 5. Decision → provisioning → activation                              */
/* ------------------------------------------------------------------ */

export const CONVERSATION_DECISIONS = [
  'accept',
  'waitlist',
  'request_evidence',
  'disqualify',
  'needs_you',
] as const;
export type ConversationDecision = (typeof CONVERSATION_DECISIONS)[number];

export const NEEDS_YOU_REASONS = [
  'ambiguous_identity',
  'ambiguous_authority',
  'ambiguous_offer',
  'refund_judgment',
  'safety',
  'high_value',
] as const;
export type NeedsYouReason = (typeof NEEDS_YOU_REASONS)[number];

export interface ConversationDecisionInput {
  readonly identity: ConversationIdentityResolution;
  readonly qualification: QualificationReceipt;
  readonly paymentState?: PaymentLinkState | null;
  /** Product/build readiness for the relevant candidate run. */
  readonly fulfillmentReady: boolean;
  readonly needsYouTriggers?: readonly NeedsYouReason[];
}

export interface ConversationDecisionResult {
  readonly decision: ConversationDecision;
  readonly needsYouReasons: readonly NeedsYouReason[];
  /** Acquisition-kernel state the durable record should move to. */
  readonly acquisitionState: AcquisitionState;
}

export function decideConversationOutcome(
  input: ConversationDecisionInput
): ConversationDecisionResult {
  const reasons = new Set<NeedsYouReason>(input.needsYouTriggers ?? []);
  if (input.identity.authority === 'ambiguous')
    reasons.add('ambiguous_identity');
  if (input.identity.requiresConfirmation && input.identity.publicSurface) {
    reasons.add('ambiguous_authority');
  }

  if (reasons.size > 0) {
    return {
      decision: 'needs_you',
      needsYouReasons: [...reasons],
      acquisitionState: 'human_review',
    };
  }

  switch (input.qualification.recommendedNextAction) {
    case 'disqualify':
      return {
        decision: 'disqualify',
        needsYouReasons: [],
        acquisitionState: 'disqualified',
      };
    case 'request_evidence':
      return {
        decision: 'request_evidence',
        needsYouReasons: [],
        acquisitionState: 'qualified',
      };
    case 'needs_you':
      return {
        decision: 'needs_you',
        needsYouReasons: ['high_value'],
        acquisitionState: 'human_review',
      };
    default:
      break;
  }

  if (input.paymentState === 'paid') {
    // A paid commitment is a bounded fulfillment obligation, not proof the
    // product is ready.
    return {
      decision: input.fulfillmentReady ? 'accept' : 'waitlist',
      needsYouReasons: [],
      acquisitionState: input.fulfillmentReady ? 'claimed' : 'contacted',
    };
  }

  return {
    decision: input.fulfillmentReady ? 'accept' : 'waitlist',
    needsYouReasons: [],
    acquisitionState: input.fulfillmentReady ? 'qualified' : 'inbound_waiting',
  };
}

/* ------------------------------------------------------------------ */
/* 6. Activation proof and public-channel gate                          */
/* ------------------------------------------------------------------ */

/**
 * Activation requires delivered value in-thread, not account creation.
 */
export function activationSatisfied(events: readonly string[]): boolean {
  return (
    events.includes('value_delivered') ||
    (events.includes('provisioned') && events.includes('first_use_confirmed'))
  );
}

export interface PublicChannelCertification {
  readonly responseLoopCertified: boolean;
  readonly identityRulesCertified: boolean;
  readonly moderationCertified: boolean;
  readonly escalationCertified: boolean;
}

export function evaluatePublicChannelIntake(cert: PublicChannelCertification): {
  readonly allowed: boolean;
  readonly missing: readonly string[];
} {
  const missing: string[] = [];
  if (!cert.responseLoopCertified) missing.push('response_loop');
  if (!cert.identityRulesCertified) missing.push('identity_rules');
  if (!cert.moderationCertified) missing.push('moderation');
  if (!cert.escalationCertified) missing.push('escalation');
  return { allowed: missing.length === 0, missing };
}
