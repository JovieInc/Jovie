import { createHash } from 'node:crypto';
import { lintCopy } from '@jovie/copy';
import type { CanonicalAnswer } from './answer-reuse';

// ============================================================================
// Investor follow-up email contract (JOV-5026 first slice)
// ============================================================================
// One private question + one approved canonical answer revision produce one
// personalized draft for the existing operator review queue. A draft is never
// a send. Approval binds exact content, recipient, sender, destination,
// expiry, and the single permitted action. Delivery observations land in an
// append-only ledger; ambiguous acknowledgments reconcile to `unknown` and
// never trigger a blind resend.
// ============================================================================

export type FollowupLinkScope = 'public-article' | 'private-memo';

export interface FollowupLink {
  readonly url: string;
  readonly scope: FollowupLinkScope;
  /** Private memo links require an explicit access expiry. */
  readonly accessExpiresAt?: string;
}

/**
 * One private investor question. `concern` stays out of any public surface;
 * it exists so the reply answers the actual question instead of a template.
 */
export interface InvestorQuestionRecord {
  readonly questionId: string;
  readonly askedAt: string;
  readonly concern: string;
  /** Set when the reply should continue an existing conversation thread. */
  readonly existingThreadId?: string;
}

export interface FollowupRecipient {
  readonly email: string;
  readonly displayName?: string;
  /** Token-gated portal identity this recipient resolved from, when known. */
  readonly investorLinkId?: string;
}

export interface FollowupSender {
  readonly senderId: string;
  readonly address: string;
}

export interface FollowupRenderedPayload {
  readonly subject: string;
  readonly bodyText: string;
}

export type FollowupDeliveryState =
  | 'draft'
  | 'approved'
  | 'queued'
  | 'provider_accepted'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'unknown'
  | 'suppressed'
  | 'cancelled';

export type FollowupPermittedAction = 'send-once' | 'copy-manual';

export interface FollowupEmailDraft {
  readonly draftId: string;
  /** Stable idempotency key; replaying the same inputs yields the same key. */
  readonly idempotencyKey: string;
  readonly state: 'draft';
  readonly questionId: string;
  readonly sourceAnswerId: string;
  readonly sourceAnswerVersion: string;
  readonly claimRevisions: readonly { claimId: string; revisionId: string }[];
  readonly senderId: string;
  readonly recipientEmail: string;
  readonly threadId?: string;
  readonly link: FollowupLink | null;
  readonly payload: FollowupRenderedPayload;
  readonly payloadHash: string;
  readonly preparedAt: string;
}

export interface FollowupApproval {
  readonly draftId: string;
  readonly payloadHash: string;
  readonly recipientEmail: string;
  readonly senderId: string;
  readonly destination: 'provider' | 'operator-manual';
  readonly permittedAction: FollowupPermittedAction;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface FollowupLedgerEvent {
  readonly state: FollowupDeliveryState;
  readonly occurredAt: string;
  readonly actor: string;
  /**
   * Opaque provider reference, or an explicitly labeled operator-reported
   * receipt such as `operator-reported:tim-2026-09-28`. Never invented.
   */
  readonly reference: string;
}

const MAX_BODY_SENTENCES = 12;
const MAX_FOLLOWUP_ATTEMPTS = 2;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;
const PRIVATE_TOKEN_HINT = /[?&](?:t|token|key|sig|signature)=/iu;
const FABRICATED_PRESSURE =
  /\b(?:act now|limited time|last chance|only \d+ (?:spots|seats|allocations)|exclusive offer|just for you|as discussed|great catching up|per our conversation)\b/iu;

export class InvestorFollowupError extends Error {
  constructor(
    readonly code:
      | 'question_invalid'
      | 'answer_not_approved'
      | 'claim_revision_mismatch'
      | 'payload_invalid'
      | 'link_invalid'
      | 'approval_invalid'
      | 'approval_expired'
      | 'delivery_transition_invalid'
      | 'retry_not_allowed'
      | 'send_state_invalid',
    message: string
  ) {
    super(message);
    this.name = 'InvestorFollowupError';
  }
}

function isIso(value: string | undefined): boolean {
  return Boolean(
    value && ISO_DATETIME.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sentenceCount(text: string): number {
  const matches = text.match(/[.!?]+(?=\s|$)/gu);
  return matches ? matches.length : 0;
}

function payloadText(payload: FollowupRenderedPayload): string {
  return `${payload.subject}\n${payload.bodyText}`;
}

function assertPublicUrlHygiene(
  url: string,
  recipient: FollowupRecipient,
  question: InvestorQuestionRecord
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvestorFollowupError(
      'link_invalid',
      'Follow-up links must be absolute URLs.'
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new InvestorFollowupError(
      'link_invalid',
      'Follow-up links must use https.'
    );
  }
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep the raw form; malformed encoding still receives token checks.
  }
  const candidates = [url.toLowerCase(), decoded.toLowerCase()];
  const forbidden = [
    recipient.email,
    recipient.displayName,
    question.concern,
  ].filter((value): value is string => Boolean(value?.trim()));
  for (const marker of forbidden) {
    if (
      candidates.some(candidate =>
        candidate.includes(marker.trim().toLowerCase())
      )
    ) {
      throw new InvestorFollowupError(
        'link_invalid',
        'Public follow-up links cannot embed the investor name, email, or private question.'
      );
    }
  }
  if (PRIVATE_TOKEN_HINT.test(url)) {
    throw new InvestorFollowupError(
      'link_invalid',
      'Public follow-up links cannot carry bearer secrets or token parameters.'
    );
  }
}

function composePayload(input: {
  readonly recipient: FollowupRecipient;
  readonly answer: CanonicalAnswer;
  readonly link: FollowupLink | null;
  readonly nextStep: string;
}): FollowupRenderedPayload {
  const greeting = input.recipient.displayName?.trim()
    ? `Hi ${input.recipient.displayName.trim()},`
    : 'Hi,';
  const lines = [greeting, '', input.answer.directAnswer.trim()];
  if (input.link) {
    lines.push('', `More detail: ${input.link.url}`);
  }
  lines.push('', input.nextStep.trim());
  const body = lines.join('\n');
  return {
    subject: 'Following up on your Jovie question',
    bodyText: body,
  };
}

function assertFollowupParties(
  question: InvestorQuestionRecord,
  recipient: FollowupRecipient,
  sender: FollowupSender
): void {
  if (
    !question.questionId.trim() ||
    !isIso(question.askedAt) ||
    !question.concern.trim()
  ) {
    throw new InvestorFollowupError(
      'question_invalid',
      'Follow-up drafts require a question id, ask time, and the actual concern.'
    );
  }
  if (!EMAIL.test(recipient.email)) {
    throw new InvestorFollowupError(
      'question_invalid',
      'The recipient must resolve to a deliverable email address.'
    );
  }
  if (!sender.senderId.trim() || !EMAIL.test(sender.address)) {
    throw new InvestorFollowupError(
      'approval_invalid',
      'Follow-ups require an identified authorized sender.'
    );
  }
}

function assertClaimRevisions(
  answer: CanonicalAnswer,
  claimUses: readonly { claimId: string; revisionId: string }[]
): void {
  const currentClaims = new Map(
    answer.claims.map(claim => [claim.claimId, claim.revisionId] as const)
  );
  const seen = new Set<string>();
  for (const use of claimUses) {
    if (seen.has(use.claimId)) {
      throw new InvestorFollowupError(
        'claim_revision_mismatch',
        'Each claim revision is referenced once per follow-up.'
      );
    }
    seen.add(use.claimId);
    if (currentClaims.get(use.claimId) !== use.revisionId) {
      throw new InvestorFollowupError(
        'claim_revision_mismatch',
        'Follow-ups must bind the exact current canonical claim revisions.'
      );
    }
  }
}

function assertLinkContract(
  link: FollowupLink | null,
  recipient: FollowupRecipient,
  question: InvestorQuestionRecord
): void {
  if (!link) {
    return;
  }
  if (link.scope === 'public-article') {
    assertPublicUrlHygiene(link.url, recipient, question);
  } else if (!link.accessExpiresAt || !isIso(link.accessExpiresAt)) {
    throw new InvestorFollowupError(
      'link_invalid',
      'Private memo links require an explicit access expiry.'
    );
  }
}

function assertPayloadContract(
  payload: FollowupRenderedPayload,
  answer: CanonicalAnswer
): void {
  if (
    sentenceCount(payload.bodyText) > MAX_BODY_SENTENCES ||
    !payload.bodyText.includes(answer.directAnswer.trim())
  ) {
    throw new InvestorFollowupError(
      'payload_invalid',
      'Follow-ups must directly answer the concern in a few sentences and stay useful without a click.'
    );
  }
  if (FABRICATED_PRESSURE.test(payloadText(payload))) {
    throw new InvestorFollowupError(
      'payload_invalid',
      'Follow-ups cannot fabricate urgency, familiarity, or scarcity.'
    );
  }
  const blocking = lintCopy(payloadText(payload), {
    register: 'founder-tim',
  }).blocking[0];
  if (blocking) {
    throw new InvestorFollowupError(
      'payload_invalid',
      `Copy check failed (${blocking.rule}): ${blocking.message}`
    );
  }
}

/**
 * Prepares one personalized draft for the operator review queue. The result
 * is a draft only — composing it sends nothing and consumes no approval.
 */
export function prepareInvestorFollowupDraft(input: {
  readonly question: InvestorQuestionRecord;
  readonly answer: CanonicalAnswer;
  readonly claimUses: readonly { claimId: string; revisionId: string }[];
  readonly recipient: FollowupRecipient;
  readonly sender: FollowupSender;
  readonly link?: FollowupLink | null;
  /** The single relevant next step offered to the investor. */
  readonly nextStep: string;
  readonly now: string;
}): FollowupEmailDraft {
  const { question, answer, recipient, sender } = input;
  assertFollowupParties(question, recipient, sender);
  if (answer.review.state !== 'approved') {
    throw new InvestorFollowupError(
      'answer_not_approved',
      'Follow-ups can only cite an approved canonical answer revision.'
    );
  }
  assertClaimRevisions(answer, input.claimUses);
  const link = input.link ?? null;
  assertLinkContract(link, recipient, question);
  const nextStep = input.nextStep.trim();
  if (!nextStep || nextStep.includes('\n')) {
    throw new InvestorFollowupError(
      'payload_invalid',
      'Follow-ups carry at most one relevant next step.'
    );
  }
  if (!isIso(input.now)) {
    throw new InvestorFollowupError(
      'payload_invalid',
      'Drafts require a real preparation timestamp.'
    );
  }
  const payload = composePayload({
    recipient,
    answer,
    link,
    nextStep,
  });
  assertPayloadContract(payload, answer);
  const payloadHash = hash(payloadText(payload));
  return {
    draftId: `followup-${payloadHash.slice(0, 16)}`,
    idempotencyKey: `investor-followup:${question.questionId}:${answer.answerId}:${answer.version}:${hash(recipient.email.toLowerCase()).slice(0, 16)}:${payloadHash.slice(0, 16)}`,
    state: 'draft',
    questionId: question.questionId,
    sourceAnswerId: answer.answerId,
    sourceAnswerVersion: answer.version,
    claimRevisions: input.claimUses.map(use => ({ ...use })),
    senderId: sender.senderId,
    recipientEmail: recipient.email,
    threadId: question.existingThreadId,
    link,
    payload,
    payloadHash,
    preparedAt: input.now,
  };
}

/**
 * Scanner/preview projection. Returns the exact payload the operator will
 * review without transitioning state, consuming approval, or recording a
 * delivery event. Safe for link scanners and preview GETs.
 */
export function previewInvestorFollowup(
  draft: FollowupEmailDraft
): FollowupRenderedPayload {
  return draft.payload;
}

/**
 * Records human approval of the exact rendered payload. Approval binds the
 * payload hash, recipient, sender, destination, expiry, and one permitted
 * action; any material change requires a new approval.
 */
export function prepareInvestorFollowupApproval(input: {
  readonly draft: FollowupEmailDraft;
  readonly approvedBy: string;
  readonly now: string;
  readonly expiresAt: string;
  readonly destination: FollowupApproval['destination'];
  readonly permittedAction: FollowupPermittedAction;
}): FollowupApproval {
  if (
    !input.approvedBy.trim() ||
    !isIso(input.now) ||
    !isIso(input.expiresAt)
  ) {
    throw new InvestorFollowupError(
      'approval_invalid',
      'Approval requires an accountable approver and real timestamps.'
    );
  }
  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) {
    throw new InvestorFollowupError(
      'approval_expired',
      'Approval expiry must be after the approval time.'
    );
  }
  if (
    input.destination === 'provider' &&
    input.permittedAction !== 'send-once'
  ) {
    throw new InvestorFollowupError(
      'approval_invalid',
      'Provider delivery only permits a single send.'
    );
  }
  return {
    draftId: input.draft.draftId,
    payloadHash: input.draft.payloadHash,
    recipientEmail: input.draft.recipientEmail,
    senderId: input.draft.senderId,
    destination: input.destination,
    permittedAction: input.permittedAction,
    approvedBy: input.approvedBy,
    approvedAt: input.now,
    expiresAt: input.expiresAt,
  };
}

export type FollowupDeliveryReadiness =
  | { readonly state: 'deliverable' }
  | { readonly state: 'requires-new-approval'; readonly reason: string }
  | { readonly state: 'suppressed' }
  | { readonly state: 'revoked'; readonly reason: string };

/**
 * Immediate pre-delivery recheck. Stale claims, revoked private access,
 * recipient suppression, a changed payload or recipient, and expiry all block
 * delivery; material changes route back to a new approval.
 */
export function recheckInvestorFollowupBeforeDelivery(input: {
  readonly draft: FollowupEmailDraft;
  readonly approval: FollowupApproval;
  readonly currentAnswerVersion: string;
  readonly currentClaimRevisions: ReadonlyMap<string, string>;
  readonly recipientAccessActive: boolean;
  readonly recipientSuppressed: boolean;
  readonly outboundEnabled: boolean;
  readonly now: string;
}): FollowupDeliveryReadiness {
  const { draft, approval } = input;
  if (!input.outboundEnabled) {
    return {
      state: 'revoked',
      reason: 'Outbound delivery is disabled by the kill switch.',
    };
  }
  if (input.recipientSuppressed) {
    return { state: 'suppressed' };
  }
  if (
    approval.draftId !== draft.draftId ||
    approval.payloadHash !== draft.payloadHash ||
    approval.recipientEmail !== draft.recipientEmail ||
    approval.senderId !== draft.senderId
  ) {
    return {
      state: 'requires-new-approval',
      reason: 'Content, recipient, or sender changed since approval.',
    };
  }
  if (
    !isIso(input.now) ||
    Date.parse(input.now) >= Date.parse(approval.expiresAt)
  ) {
    return {
      state: 'requires-new-approval',
      reason: 'The approval window expired.',
    };
  }
  if (input.currentAnswerVersion !== draft.sourceAnswerVersion) {
    return {
      state: 'requires-new-approval',
      reason: 'The canonical answer was revised after approval.',
    };
  }
  for (const use of draft.claimRevisions) {
    if (input.currentClaimRevisions.get(use.claimId) !== use.revisionId) {
      return {
        state: 'requires-new-approval',
        reason: 'A cited claim revision changed after approval.',
      };
    }
  }
  if (draft.link?.scope === 'private-memo' && !input.recipientAccessActive) {
    return {
      state: 'requires-new-approval',
      reason: 'Private memo access for this recipient was revoked or expired.',
    };
  }
  return { state: 'deliverable' };
}

/**
 * Durable ledger transition. Replay and reconciliation rules:
 * - `provider_accepted` is not confirmed delivery.
 * - Ambiguous provider acknowledgments record `unknown`; retry is not allowed
 *   from `unknown` until a human reconciles to `delivered`, `bounced`,
 *   or `failed`.
 * - A terminal state (`delivered`, `bounced`, `suppressed`, `cancelled`)
 *   accepts no further sends.
 */
export function transitionInvestorFollowup(input: {
  readonly ledger: readonly FollowupLedgerEvent[];
  readonly event: FollowupLedgerEvent;
  readonly attemptCount: number;
}): FollowupDeliveryState {
  const current = input.ledger.at(-1)?.state ?? 'draft';
  const next = input.event.state;
  const allowed: Record<
    FollowupDeliveryState,
    readonly FollowupDeliveryState[]
  > = {
    draft: ['approved', 'cancelled'],
    approved: ['queued', 'cancelled', 'suppressed'],
    queued: ['provider_accepted', 'failed', 'suppressed', 'cancelled'],
    provider_accepted: ['delivered', 'bounced', 'failed', 'unknown'],
    delivered: [],
    bounced: [],
    failed: ['queued'],
    unknown: ['delivered', 'bounced', 'failed'],
    suppressed: [],
    cancelled: [],
  };
  if (current === 'unknown' && next === 'queued') {
    throw new InvestorFollowupError(
      'retry_not_allowed',
      'Do not resend while an acknowledgment is ambiguous; reconcile first.'
    );
  }
  if (!allowed[current].includes(next)) {
    throw new InvestorFollowupError(
      'delivery_transition_invalid',
      `Cannot move a ${current} follow-up to ${next}.`
    );
  }
  if (next === 'queued' && input.attemptCount >= MAX_FOLLOWUP_ATTEMPTS) {
    throw new InvestorFollowupError(
      'retry_not_allowed',
      'Follow-up retries are bounded; reconcile the delivery ledger first.'
    );
  }
  if (!isIso(input.event.occurredAt)) {
    throw new InvestorFollowupError(
      'delivery_transition_invalid',
      'Ledger events require a real occurrence time.'
    );
  }
  const last = input.ledger.at(-1);
  if (
    last &&
    Date.parse(input.event.occurredAt) < Date.parse(last.occurredAt)
  ) {
    throw new InvestorFollowupError(
      'delivery_transition_invalid',
      'Ledger events cannot predate the current state.'
    );
  }
  return next;
}

/**
 * True when a replayed delivery job describes an already-ledgered outcome for
 * the same draft, so duplicate jobs never produce a second send.
 */
export function isInvestorFollowupReplay(
  draft: FollowupEmailDraft,
  ledger: readonly (FollowupLedgerEvent & { readonly draftId?: string })[]
): boolean {
  return ledger.some(
    event =>
      event.draftId === draft.draftId &&
      ['provider_accepted', 'delivered', 'bounced'].includes(event.state)
  );
}
