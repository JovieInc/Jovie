import { createHash } from 'node:crypto';
import type {
  OutboundChannel,
  OutboundCopy,
  OutboundCopyState,
  OutboundRejectReason,
  OutboundTargetState,
} from './types';
import { OUTBOUND_CHANNELS, OUTBOUND_REJECT_REASONS } from './types';

/**
 * Founder outbound approval (Tim, 2026-10-04: "Outbound needs my approval on
 * every copy and target").
 *
 * Approval is recorded per target revision and per copy revision as
 * append-only rows in `contact_evidence_reviews` (the JOV-7321 Yes / No /
 * Unsure ledger). A send is allowed only when the newest target row and the
 * newest copy row are both founder `yes` decisions bound to the target as it
 * is right now, and the copy row carries the exact text being sent. Editing
 * copy appends an `unsure` draft row, so the edit itself withdraws approval.
 */

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

export interface OutboundApprovalState {
  readonly targetRevision: string;
  readonly target: OutboundTargetState;
  readonly rejectReason: OutboundRejectReason | null;
  readonly copy: OutboundCopyState;
  /** Newest copy on file for this target, approved or not. */
  readonly latestCopy: (OutboundCopy & { readonly revision: string }) | null;
  /** The copy a send may use. Null unless both target and copy are approved. */
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
 * The never-auto-send guard. Every send path calls this with the target as
 * it is at send time; anything not approved at that exact revision is refused.
 */
export function evaluateOutboundSend(input: {
  readonly target: OutboundTarget;
  readonly channel: OutboundChannel;
  readonly rows: readonly OutboundLedgerRow[];
}): OutboundSendPermission {
  const state = resolveOutboundApproval(input.target, input.rows);
  if (state.target !== 'approved')
    return { allowed: false, reason: 'target_not_approved' };
  if (!state.sendableCopy)
    return { allowed: false, reason: 'copy_not_approved' };
  if (state.sendableCopy.channel !== input.channel)
    return { allowed: false, reason: 'channel_mismatch' };
  return { allowed: true, copy: state.sendableCopy };
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
