import { createHash } from 'node:crypto';
import { denyAudienceEffect } from './audience-effect-policy';

/**
 * Founder approval is append-only review evidence bound to target and copy
 * revisions. Current audience/acquisition delivery remains disabled even when
 * both newest rows are founder yes decisions. Ledger helpers support review
 * and drafting; only the deterministic policy governs dispatch refusal.
 */

export const OUTBOUND_CHANNELS = ['email', 'dm'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_DECISIONS = ['yes', 'no', 'unsure'] as const;
export type OutboundDecision = (typeof OUTBOUND_DECISIONS)[number];

/** Why Tim rejected a target. Feeds qualification learning (JOV-6650). */
export const OUTBOUND_REJECT_REASONS = [
  'wrong_person',
  'not_an_artist',
  'has_team',
  'too_big',
  'not_a_fit',
  'bad_data',
  'other',
] as const;
export type OutboundRejectReason = (typeof OUTBOUND_REJECT_REASONS)[number];

export const OUTBOUND_REJECT_REASON_LABELS: Record<
  OutboundRejectReason,
  string
> = {
  wrong_person: 'Wrong person',
  not_an_artist: 'Not an artist',
  has_team: 'Has a team',
  too_big: 'Too big',
  not_a_fit: 'Not a fit',
  bad_data: 'Bad data',
  other: 'Other',
};

export function outboundTargetEvidenceKey(leadId: string): string {
  return `outbound:target:${leadId}`;
}

export function outboundCopyEvidenceKey(leadId: string): string {
  return `outbound:copy:${leadId}`;
}

/** The person and the address a message would reach. */
export interface OutboundTarget {
  readonly leadId: string;
  readonly displayName: string;
  readonly contactEmail: string | null;
  readonly instagramHandle: string | null;
  readonly creatorProfileId: string | null;
  readonly claimUrl: string | null;
}

export interface OutboundCopy {
  readonly channel: OutboundChannel;
  readonly subject: string | null;
  readonly body: string;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Any change to who or where the message reaches is a new target revision. */
export function outboundTargetRevision(target: OutboundTarget): string {
  return digest([
    'outbound-target/v1',
    target.leadId,
    target.displayName.trim(),
    target.contactEmail?.trim().toLowerCase() ?? null,
    target.instagramHandle?.trim().toLowerCase() ?? null,
    target.creatorProfileId,
    target.claimUrl,
  ]);
}

/** Copy revisions bind the exact text to one target revision. */
export function outboundCopyRevision(
  targetRevision: string,
  copy: OutboundCopy
): string {
  return digest([
    'outbound-copy/v1',
    targetRevision,
    copy.channel,
    copy.subject,
    copy.body,
  ]);
}

/** One ledger row, as read back from `contact_evidence_reviews`. */
export interface OutboundLedgerRow {
  readonly evidenceKey: string;
  readonly evidenceRevision: string;
  readonly decision: string;
  readonly snapshot: Record<string, unknown>;
  readonly actorUserId: string | null;
  readonly createdAt: Date | string;
}

export type OutboundTargetState =
  | 'unreviewed'
  | 'approved'
  | 'held'
  | 'rejected'
  | 'stale';

export type OutboundCopyState = 'draft' | 'approved' | 'rejected' | 'stale';

export interface OutboundApprovalState {
  readonly targetRevision: string;
  readonly target: OutboundTargetState;
  readonly rejectReason: OutboundRejectReason | null;
  readonly copy: OutboundCopyState;
  /** Newest copy on file for this target, approved or not. */
  readonly latestCopy: (OutboundCopy & { readonly revision: string }) | null;
  /** Exact approved copy for review; this does not grant delivery permission. */
  readonly sendableCopy: (OutboundCopy & { readonly revision: string }) | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
}

function time(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function newest(
  rows: readonly OutboundLedgerRow[],
  key: string
): OutboundLedgerRow | null {
  let best: OutboundLedgerRow | null = null;
  for (const row of rows) {
    if (row.evidenceKey !== key) continue;
    if (!best || time(row.createdAt) >= time(best.createdAt)) best = row;
  }
  return best;
}

function readCopy(row: OutboundLedgerRow): OutboundCopy | null {
  const { channel, subject, body } = row.snapshot;
  if (
    !OUTBOUND_CHANNELS.includes(channel as OutboundChannel) ||
    typeof body !== 'string' ||
    body.trim().length === 0 ||
    (subject !== null && typeof subject !== 'string')
  )
    return null;
  return { channel: channel as OutboundChannel, subject, body };
}

function readRejectReason(row: OutboundLedgerRow): OutboundRejectReason | null {
  const reason = row.snapshot.reason;
  return OUTBOUND_REJECT_REASONS.includes(reason as OutboundRejectReason)
    ? (reason as OutboundRejectReason)
    : null;
}

/** Derive the founder approval state for one target from its ledger rows. */
export function resolveOutboundApproval(
  target: OutboundTarget,
  rows: readonly OutboundLedgerRow[]
): OutboundApprovalState {
  const targetRevision = outboundTargetRevision(target);
  const targetRow = newest(rows, outboundTargetEvidenceKey(target.leadId));
  const copyRow = newest(rows, outboundCopyEvidenceKey(target.leadId));

  let targetState: OutboundTargetState = 'unreviewed';
  if (targetRow) {
    if (targetRow.decision === 'no') targetState = 'rejected';
    else if (targetRow.decision === 'unsure') targetState = 'held';
    else if (
      targetRow.decision === 'yes' &&
      targetRow.actorUserId &&
      targetRow.evidenceRevision === targetRevision
    )
      targetState = 'approved';
    else targetState = 'stale';
  }

  const parsed = copyRow ? readCopy(copyRow) : null;
  // A row whose text no longer hashes to its revision was not what Tim saw.
  const intact =
    copyRow &&
    parsed &&
    copyRow.snapshot.targetRevision === targetRevision &&
    outboundCopyRevision(targetRevision, parsed) === copyRow.evidenceRevision;
  const latestCopy =
    copyRow && parsed
      ? { ...parsed, revision: copyRow.evidenceRevision }
      : null;

  let copyState: OutboundCopyState = 'draft';
  if (copyRow && !intact) copyState = 'stale';
  else if (copyRow?.decision === 'no') copyState = 'rejected';
  else if (copyRow?.decision === 'yes' && copyRow.actorUserId)
    copyState = 'approved';

  const claimLinkPresent =
    !target.claimUrl || Boolean(parsed?.body.includes(target.claimUrl));
  const sendable =
    targetState === 'approved' &&
    copyState === 'approved' &&
    claimLinkPresent &&
    latestCopy !== null;

  return {
    targetRevision,
    target: targetState,
    rejectReason:
      targetState === 'rejected' && targetRow
        ? readRejectReason(targetRow)
        : null,
    copy: copyState,
    latestCopy,
    sendableCopy: sendable ? latestCopy : null,
    approvedAt:
      sendable && copyRow
        ? new Date(time(copyRow.createdAt)).toISOString()
        : null,
    approvedBy: sendable && copyRow ? copyRow.actorUserId : null,
  };
}

export type OutboundSendRefusal =
  | 'audience_delivery_disabled'
  | 'target_not_approved'
  | 'copy_not_approved'
  | 'channel_mismatch';

export type OutboundSendPermission =
  | {
      readonly allowed: true;
      readonly copy: OutboundCopy & { readonly revision: string };
    }
  | { readonly allowed: false; readonly reason: OutboundSendRefusal };

/**
 * Current audience/acquisition delivery is disabled. Approval rows remain
 * review evidence; even exact approved revisions cannot authorize sending.
 */
export function evaluateOutboundSend(input: {
  readonly target: OutboundTarget;
  readonly channel: OutboundChannel;
  readonly rows: readonly OutboundLedgerRow[];
}): OutboundSendPermission {
  const policy = denyAudienceEffect(
    input.channel === 'email' ? 'audience.email.send' : 'audience.dm.send'
  );
  return {
    allowed: policy.dispatchAllowed,
    reason: 'audience_delivery_disabled',
  };
}

export type OutboundHistoryRecordPermission =
  | {
      readonly historyRecordAllowed: true;
      readonly dispatchAllowed: false;
      readonly copy: OutboundCopy & { readonly revision: string };
    }
  | {
      readonly historyRecordAllowed: false;
      readonly dispatchAllowed: false;
      readonly reason: OutboundSendRefusal;
    };

/**
 * Review eligibility for recording an operator's manual contact history.
 * This local activity never authorizes delivery or verifies an external send.
 * Callers must independently authenticate the operator and label provenance.
 */
export function evaluateOutboundHistoryRecord(input: {
  readonly target: OutboundTarget;
  readonly channel: OutboundChannel;
  readonly rows: readonly OutboundLedgerRow[];
}): OutboundHistoryRecordPermission {
  const state = resolveOutboundApproval(input.target, input.rows);
  if (state.target !== 'approved') {
    return {
      historyRecordAllowed: false,
      dispatchAllowed: false,
      reason: 'target_not_approved',
    };
  }
  if (!state.sendableCopy) {
    return {
      historyRecordAllowed: false,
      dispatchAllowed: false,
      reason: 'copy_not_approved',
    };
  }
  if (state.sendableCopy.channel !== input.channel) {
    return {
      historyRecordAllowed: false,
      dispatchAllowed: false,
      reason: 'channel_mismatch',
    };
  }
  return {
    historyRecordAllowed: true,
    dispatchAllowed: false,
    copy: state.sendableCopy,
  };
}

/** Creator-generic first touch. Claims only what the pipeline has built. */
export const DEFAULT_OUTBOUND_EMAIL_SUBJECT = 'Your Jovie page is ready';
export const DEFAULT_OUTBOUND_EMAIL_TEMPLATE =
  "Hey {displayName}, I built you a free Jovie page from your public links. It's yours to claim and edit here: {claimLink}\n\nTim";

export function draftOutboundCopy(input: {
  readonly channel: OutboundChannel;
  readonly displayName: string;
  readonly claimUrl: string;
  readonly dmCopy: string | null;
}): OutboundCopy {
  if (input.channel === 'dm' && input.dmCopy?.trim()) {
    return { channel: 'dm', subject: null, body: input.dmCopy };
  }
  const body = DEFAULT_OUTBOUND_EMAIL_TEMPLATE.replaceAll(
    '{displayName}',
    input.displayName
  ).replaceAll('{claimLink}', input.claimUrl);
  return input.channel === 'email'
    ? { channel: 'email', subject: DEFAULT_OUTBOUND_EMAIL_SUBJECT, body }
    : { channel: 'dm', subject: null, body };
}
