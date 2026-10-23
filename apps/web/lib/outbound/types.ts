/**
 * Client-safe Ovie Outbound contracts: labels, views and the row/detail
 * shapes the API returns. No hashing or server code lives here.
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

export interface OutboundCopy {
  readonly channel: OutboundChannel;
  readonly subject: string | null;
  readonly body: string;
}

export type OutboundTargetState =
  | 'unreviewed'
  | 'approved'
  | 'held'
  | 'rejected'
  | 'stale';

export type OutboundCopyState = 'draft' | 'approved' | 'rejected' | 'stale';

/**
 * Views in pipeline order. "ready" means every required evidence class is on
 * file, so Tim can review facts and certify. Missing evidence is its own view,
 * and possible non-artists or unscored leads sit under "flagged" (warn-only:
 * nothing is disqualified automatically).
 */
export const OUTBOUND_VIEWS = [
  'ready',
  'needs_evidence',
  'flagged',
  'certified',
  'approved',
  'sent',
  'replied',
  'claimed',
  'paid',
  'held',
  'rejected',
] as const;
export type OutboundView = (typeof OUTBOUND_VIEWS)[number];

export const OUTBOUND_VIEW_LABELS: Record<OutboundView, string> = {
  ready: 'Ready to certify',
  needs_evidence: 'Needs evidence',
  flagged: 'Flagged',
  certified: 'Certified',
  approved: 'Approved',
  sent: 'Sent',
  replied: 'Replied',
  claimed: 'Claimed',
  paid: 'Paid',
  held: 'Held',
  rejected: 'Rejected',
};

export type OutboundBand = 'high' | 'medium' | 'low' | 'unknown';

export type OutboundNextAction =
  | 'build_profile'
  | 'gather_evidence'
  | 'check_entity'
  | 'review_facts'
  | 'approve_message'
  | 'send'
  | 'await_reply'
  | 'await_claim'
  | 'await_payment'
  | 'none';

export const OUTBOUND_NEXT_ACTION_LABELS: Record<OutboundNextAction, string> = {
  build_profile: 'Build profile',
  gather_evidence: 'Gather evidence',
  check_entity: 'Check entity',
  review_facts: 'Review facts',
  approve_message: 'Approve message',
  send: 'Ready to send',
  await_reply: 'Awaiting reply',
  await_claim: 'Awaiting claim',
  await_payment: 'Awaiting payment',
  none: '—',
};

/** Warn-only flags. They label a row and keep it out of "ready"; they never reject. */
export type OutboundFlag =
  | 'possible_non_artist'
  | 'unscored'
  | 'presence_only_fit';

export const OUTBOUND_FLAG_LABELS: Record<OutboundFlag, string> = {
  possible_non_artist: 'Possible non-artist',
  unscored: 'Unscored',
  presence_only_fit: 'Presence-only fit',
};

/** What the fit score is based on, so a thin score is not read as a judgment. */
export type OutboundFitBasis = 'scored' | 'presence_only' | 'unscored';

export interface OutboundRow {
  readonly leadId: string;
  readonly dedupeKey: string | null;
  readonly name: string;
  readonly handle: string;
  readonly avatarUrl: string | null;
  readonly profilePath: string | null;
  readonly sourceUrl: string;
  readonly view: OutboundView;
  /** A dated trigger event ("Released 3 days ago"), else null for no trigger. */
  readonly whyNow: string | null;
  readonly fit: OutboundBand;
  readonly fitScore: number | null;
  readonly fitBasis: OutboundFitBasis;
  readonly flags: readonly OutboundFlag[];
  /** Why the row is flagged as a possible non-artist, in Tim's words. */
  readonly entityNote: string | null;
  /** Required evidence classes not yet on file; empty when complete. */
  readonly missingEvidence: readonly string[];
  /** JOV-6650 owns ability and intent; unknown until it ships. */
  readonly ability: OutboundBand;
  readonly intent: OutboundBand;
  readonly certified: boolean;
  /** Only a channel with a sendable recipient on file; null when unreachable. */
  readonly channel: OutboundChannel | null;
  readonly nextAction: OutboundNextAction;
  readonly approval: {
    readonly targetRevision: string;
    readonly target: OutboundTargetState;
    readonly copy: OutboundCopyState;
    readonly rejectReason: OutboundRejectReason | null;
    readonly approvedAt: string | null;
  };
  /** Newest copy on file, else the machine draft. */
  readonly message:
    | (OutboundCopy & { readonly revision: string | null })
    | null;
  readonly rank: number;
}

export interface OutboundQueue {
  readonly generatedAt: string;
  readonly rows: readonly OutboundRow[];
  readonly counts: Record<OutboundView, number>;
}

/** Tim's actions on one row. Approve is per item only; never bulk. */
export const OUTBOUND_ACTIONS = [
  'approve',
  'save_copy',
  'hold',
  'reject',
] as const;
export type OutboundAction = (typeof OUTBOUND_ACTIONS)[number];

export const OUTBOUND_BULK_ACTIONS = ['hold', 'reject'] as const;
export type OutboundBulkAction = (typeof OUTBOUND_BULK_ACTIONS)[number];

/** Why an approval was refused, in Tim's words. */
export const OUTBOUND_REFUSAL_MESSAGES = {
  not_found: 'This lead no longer exists.',
  stale_target:
    'This person changed since you opened them. Review the refreshed row.',
  not_certified: 'Certify the current profile facts before approving outreach.',
  no_channel: 'No email or Instagram on file to reach them.',
  invalid: 'The message must be non-empty and keep the claim link.',
} as const;
export type OutboundRefusal = keyof typeof OUTBOUND_REFUSAL_MESSAGES;
