import {
  draftOutboundCopy,
  type OutboundApprovalState,
  type OutboundLedgerRow,
  type OutboundTarget,
  resolveOutboundApproval,
} from './approval';
import type {
  OutboundBand,
  OutboundChannel,
  OutboundNextAction,
  OutboundRow,
  OutboundView,
} from './types';
import { OUTBOUND_VIEWS } from './types';

/**
 * The Ovie Outbound read model: one ranked row per potential outbound artist,
 * the view each row belongs to, and the next action Tim takes on it. Pure, so
 * ranking and classification are testable without a database.
 */

/** Source facts for one lead, gathered by the server loader. */
export interface OutboundLeadFacts {
  readonly id: string;
  readonly linktreeHandle: string;
  readonly linktreeUrl: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly contactEmail: string | null;
  readonly instagramHandle: string | null;
  readonly hasInstagram: boolean;
  readonly status: string;
  readonly outreachRoute: string | null;
  readonly outreachStatus: string | null;
  readonly dmCopy: string | null;
  readonly claimToken: string | null;
  readonly fitScore: number | null;
  readonly priorityScore: number | null;
  readonly spotifyFollowers: number | null;
  readonly latestReleaseDate: Date | null;
  readonly discoveryQuery: string | null;
  readonly createdAt: Date;
  readonly ingestedAt: Date | null;
  readonly signupAt: Date | null;
  readonly signupUserId: string | null;
  readonly paidAt: Date | null;
  readonly creatorProfileId: string | null;
  readonly profileUsername: string | null;
  readonly profileAvatarUrl: string | null;
  /** A founder `profile:certification` row exists for this contact. */
  readonly certified: boolean;
  readonly replied: boolean;
}

/** Linktree page titles leak into names: "Ada - Listen on Spotify". */
export function cleanOutboundName(
  displayName: string | null,
  handle: string
): string {
  const raw = (displayName ?? '').trim();
  const cleaned = raw
    .replace(/\s+[-|–]\s+(listen on|official|instagram|tour dates).*$/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/^@+/, '')
    .trim();
  return cleaned || handle;
}

export function fitBand(score: number | null): OutboundBand {
  if (score === null) return 'unknown';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

const DAY_MS = 86_400_000;

function ago(date: Date, now: Date): string {
  const days = Math.max(
    0,
    Math.round((now.getTime() - date.getTime()) / DAY_MS)
  );
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The single strongest reason to look at this person now. */
export function whyNow(facts: OutboundLeadFacts, now: Date): string {
  if (facts.paidAt) return `Paid ${ago(facts.paidAt, now)}`;
  if (facts.signupAt) return `Claimed ${ago(facts.signupAt, now)}`;
  if (
    facts.latestReleaseDate &&
    now.getTime() - facts.latestReleaseDate.getTime() < 90 * DAY_MS
  )
    return `Released ${ago(facts.latestReleaseDate, now)}`;
  if (facts.spotifyFollowers)
    return `${facts.spotifyFollowers.toLocaleString('en-US')} Spotify followers`;
  if (facts.ingestedAt) return `Profile built ${ago(facts.ingestedAt, now)}`;
  if (facts.discoveryQuery) return `Found via "${facts.discoveryQuery}"`;
  return `Found ${ago(facts.createdAt, now)}`;
}

function channelFor(facts: OutboundLeadFacts): OutboundChannel | null {
  if (facts.outreachRoute === 'email' || facts.outreachRoute === 'both')
    return 'email';
  if (facts.outreachRoute === 'dm') return 'dm';
  if (facts.contactEmail) return 'email';
  if (facts.hasInstagram || facts.instagramHandle) return 'dm';
  return null;
}

function classify(
  facts: OutboundLeadFacts,
  approval: OutboundApprovalState
): OutboundView {
  if (facts.paidAt) return 'paid';
  if (facts.signupAt || facts.signupUserId) return 'claimed';
  if (facts.replied) return 'replied';
  if (['queued', 'sent', 'dm_sent'].includes(facts.outreachStatus ?? ''))
    return 'sent';
  if (approval.target === 'rejected' || facts.status === 'rejected')
    return 'rejected';
  if (approval.target === 'held') return 'held';
  if (approval.sendableCopy) return 'approved';
  if (facts.certified) return 'certified';
  return 'ready';
}

function nextActionFor(
  view: OutboundView,
  facts: OutboundLeadFacts
): OutboundNextAction {
  switch (view) {
    case 'ready':
      return facts.creatorProfileId ? 'review_facts' : 'build_profile';
    case 'certified':
      return 'approve_message';
    case 'approved':
      return 'send';
    case 'sent':
      return 'await_reply';
    case 'replied':
      return 'await_claim';
    case 'claimed':
      return 'await_payment';
    default:
      return 'none';
  }
}

export function buildOutboundRow(input: {
  readonly facts: OutboundLeadFacts;
  readonly target: OutboundTarget;
  readonly dedupeKey: string | null;
  readonly ledger: readonly OutboundLedgerRow[];
  readonly now: Date;
}): Omit<OutboundRow, 'rank'> {
  const { facts, target } = input;
  const approval = resolveOutboundApproval(target, input.ledger);
  const view = classify(facts, approval);
  const channel = approval.latestCopy?.channel ?? channelFor(facts);
  const name = cleanOutboundName(facts.displayName, facts.linktreeHandle);
  const message = approval.latestCopy
    ? approval.latestCopy
    : channel && target.claimUrl
      ? {
          ...draftOutboundCopy({
            channel,
            displayName: name,
            claimUrl: target.claimUrl,
            dmCopy: facts.dmCopy,
          }),
          revision: null,
        }
      : null;
  return {
    leadId: facts.id,
    dedupeKey: input.dedupeKey,
    name,
    handle: facts.linktreeHandle,
    avatarUrl: facts.profileAvatarUrl ?? facts.avatarUrl,
    profilePath: facts.profileUsername ? `/${facts.profileUsername}` : null,
    sourceUrl: facts.linktreeUrl,
    view,
    whyNow: whyNow(facts, input.now),
    fit: fitBand(facts.fitScore),
    fitScore: facts.fitScore,
    ability: 'unknown',
    intent: 'unknown',
    certified: facts.certified,
    channel,
    nextAction: nextActionFor(view, facts),
    approval: {
      targetRevision: approval.targetRevision,
      target: approval.target,
      copy: approval.copy,
      rejectReason: approval.rejectReason,
      approvedAt: approval.approvedAt,
    },
    message,
  };
}

const ACTION_ORDER: Record<OutboundNextAction, number> = {
  send: 0,
  approve_message: 1,
  review_facts: 2,
  build_profile: 3,
  await_reply: 4,
  await_claim: 5,
  await_payment: 6,
  none: 7,
};

/**
 * Rank: the closest-to-revenue action first, then fit, then the pipeline's
 * priority score, then the newest lead. Rank is stable across views.
 */
export function rankOutboundRows(
  rows: readonly Omit<OutboundRow, 'rank'>[],
  priority: ReadonlyMap<string, number | null>
): OutboundRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        ACTION_ORDER[a.nextAction] - ACTION_ORDER[b.nextAction] ||
        (b.fitScore ?? -1) - (a.fitScore ?? -1) ||
        (priority.get(b.leadId) ?? -1) - (priority.get(a.leadId) ?? -1) ||
        a.name.localeCompare(b.name)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function countOutboundViews(
  rows: readonly OutboundRow[]
): Record<OutboundView, number> {
  const counts = Object.fromEntries(
    OUTBOUND_VIEWS.map(view => [view, 0])
  ) as Record<OutboundView, number>;
  for (const row of rows) counts[row.view] += 1;
  return counts;
}
