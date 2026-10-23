import { REQUIRED_OUTREACH_EVIDENCE } from '@/lib/contacts/evidence-display';
import {
  NON_ARTIST_KIND_LABELS,
  possibleNonArtist,
} from '@/lib/leads/entity-eligibility';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
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
  OutboundFitBasis,
  OutboundFlag,
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
  readonly bio: string | null;
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
  readonly fitScoreBreakdown: unknown;
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
  /**
   * Evidence source classes observed for the built profile (same rules as the
   * certification inspection). Null when no profile is built yet.
   */
  readonly evidenceClasses: readonly string[] | null;
}

/** Linktree page titles leak into names: "Ada - Listen on Spotify". */
export function cleanOutboundName(
  displayName: string | null,
  handle: string
): string {
  return cleanScrapedDisplayName(displayName) ?? handle;
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

/**
 * The dated event that makes now the time to reach out, or null. Static
 * attributes (follower counts, when we built the profile, the search query)
 * are not triggers and never fill this column.
 */
export function whyNow(facts: OutboundLeadFacts, now: Date): string | null {
  if (facts.paidAt) return `Paid ${ago(facts.paidAt, now)}`;
  if (facts.signupAt) return `Claimed ${ago(facts.signupAt, now)}`;
  const released = facts.latestReleaseDate?.getTime();
  if (
    released !== undefined &&
    released <= now.getTime() &&
    now.getTime() - released < 90 * DAY_MS
  )
    return `Released ${ago(new Date(released), now)}`;
  return null;
}

/** Fit components that only record presence (a link exists), not fit. */
const PRESENCE_FIT_KEYS = new Set([
  'hasSpotify',
  'usesLinkInBio',
  'usesMusicTools',
  'hasContactEmail',
]);

/**
 * A score is "presence only" when every non-zero component just records that
 * a link or tool exists. Those scores cluster at 40-45 for every lead, so the
 * band they produce says nothing about fit.
 */
export function fitBasis(
  score: number | null,
  breakdown: unknown
): OutboundFitBasis {
  if (score === null) return 'unscored';
  if (!breakdown || typeof breakdown !== 'object') return 'scored';
  const signal = Object.entries(breakdown as Record<string, unknown>).some(
    ([key, value]) =>
      !PRESENCE_FIT_KEYS.has(key) && typeof value === 'number' && value > 0
  );
  return signal ? 'scored' : 'presence_only';
}

/** Required evidence classes still missing for a lead. */
export function missingEvidence(facts: OutboundLeadFacts): string[] {
  const observed = new Set(['identity', ...(facts.evidenceClasses ?? [])]);
  return REQUIRED_OUTREACH_EVIDENCE.filter(
    sourceClass => !observed.has(sourceClass)
  );
}

/** A channel counts only when its recipient is on file. */
function reachable(
  channel: OutboundChannel,
  facts: OutboundLeadFacts
): boolean {
  return channel === 'email'
    ? Boolean(facts.contactEmail?.trim())
    : Boolean(facts.instagramHandle?.trim());
}

function channelFor(facts: OutboundLeadFacts): OutboundChannel | null {
  const preferred: OutboundChannel[] =
    facts.outreachRoute === 'dm' ? ['dm', 'email'] : ['email', 'dm'];
  return preferred.find(channel => reachable(channel, facts)) ?? null;
}

function classify(
  facts: OutboundLeadFacts,
  approval: OutboundApprovalState,
  flags: readonly OutboundFlag[],
  missing: readonly string[]
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
  if (flags.includes('possible_non_artist') || flags.includes('unscored'))
    return 'flagged';
  if (!facts.creatorProfileId || missing.length) return 'needs_evidence';
  return 'ready';
}

function nextActionFor(
  view: OutboundView,
  facts: OutboundLeadFacts,
  flags: readonly OutboundFlag[]
): OutboundNextAction {
  switch (view) {
    case 'ready':
      return 'review_facts';
    case 'needs_evidence':
      return facts.creatorProfileId ? 'gather_evidence' : 'build_profile';
    case 'flagged':
      return flags.includes('possible_non_artist')
        ? 'check_entity'
        : 'review_facts';
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
  const nonArtist = possibleNonArtist({
    handle: facts.linktreeHandle,
    displayName: facts.displayName,
    bio: facts.bio,
  });
  const basis = fitBasis(facts.fitScore, facts.fitScoreBreakdown);
  const flags: OutboundFlag[] = [];
  if (nonArtist) flags.push('possible_non_artist');
  if (basis === 'unscored') flags.push('unscored');
  if (basis === 'presence_only') flags.push('presence_only_fit');
  const missing = missingEvidence(facts);
  const view = classify(facts, approval, flags, missing);
  const saved = approval.latestCopy?.channel;
  // A saved draft keeps its channel only while its recipient is on file.
  const channel = saved && reachable(saved, facts) ? saved : channelFor(facts);
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
    fit: basis === 'scored' ? fitBand(facts.fitScore) : 'unknown',
    fitScore: facts.fitScore,
    fitBasis: basis,
    flags,
    entityNote: nonArtist ? NON_ARTIST_KIND_LABELS[nonArtist] : null,
    missingEvidence: missing,
    ability: 'unknown',
    intent: 'unknown',
    certified: facts.certified,
    channel,
    nextAction: nextActionFor(view, facts, flags),
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
  gather_evidence: 3,
  check_entity: 4,
  build_profile: 5,
  await_reply: 6,
  await_claim: 7,
  await_payment: 8,
  none: 9,
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
