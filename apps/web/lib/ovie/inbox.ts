import type { DesignProposal } from '@/lib/agent-os/design-lab/types';
import type { SummerCard } from '@/lib/ovie/summer-cards';

/**
 * Ovie Inbox: one founder decision queue over Summer approval cards and
 * Design Lab taste proposals. Client-safe (types + pure mapping only).
 */

export type OvieInboxSource = 'summer' | 'design-lab';
export type OvieInboxKind = SummerCard['kind'];
export type OvieInboxStatus = 'pending' | 'approved' | 'rejected';
export type OvieInboxDecision = 'approve' | 'reject';

export interface OvieInboxItem {
  /** Stable across sources: `summer:<id>` or `design-lab:<id>`. */
  readonly key: string;
  readonly source: OvieInboxSource;
  /** Id the owning decision endpoint expects. */
  readonly sourceId: string;
  readonly kind: OvieInboxKind;
  readonly product: SummerCard['product'];
  readonly title: string;
  readonly body: string;
  readonly recommendation: string | null;
  readonly defaultIfSilent: string | null;
  readonly recipient: string | null;
  readonly amountUsd: number | null;
  readonly evidence: readonly string[];
  readonly imageUrl: string | null;
  readonly status: OvieInboxStatus;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  /** Design Lab reviews are addressed by day bucket. */
  readonly dayBucket: string | null;
  /** Design Lab rejects must carry direction notes. */
  readonly rejectRequiresComment: boolean;
}

export type OvieInboxSourceHealth = 'ok' | 'error';

export interface OvieInboxResponse {
  readonly pending: readonly OvieInboxItem[];
  readonly decided: readonly OvieInboxItem[];
  readonly sources: Readonly<Record<OvieInboxSource, OvieInboxSourceHealth>>;
  readonly fetchedAt: string;
}

export const OVIE_INBOX_KIND_LABELS: Record<OvieInboxKind, string> = {
  outbound: 'Outbound',
  spend: 'Spend',
  taste: 'Taste',
  decision: 'Decision',
};

export const OVIE_INBOX_PRODUCT_LABELS: Record<SummerCard['product'], string> =
  {
    jov: 'Jovie',
    lyb: 'LYB',
    company: 'Company',
  };

export const OVIE_INBOX_SOURCE_LABELS: Record<OvieInboxSource, string> = {
  summer: 'Summer',
  'design-lab': 'Design Lab',
};

export function inboxItemFromSummerCard(card: SummerCard): OvieInboxItem {
  return {
    key: `summer:${card.id}`,
    source: 'summer',
    sourceId: card.id,
    kind: card.kind,
    product: card.product,
    title: card.title,
    body: card.body,
    recommendation: card.recommendation,
    defaultIfSilent: card.defaultIfSilent,
    recipient: card.recipient,
    amountUsd: card.amountUsd,
    evidence: card.evidence,
    imageUrl: null,
    status: card.status,
    comment: card.comment,
    createdAt: card.createdAt,
    decidedAt: card.decidedAt,
    dayBucket: null,
    rejectRequiresComment: false,
  };
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

export function inboxItemFromDesignProposal(
  proposal: DesignProposal
): OvieInboxItem {
  const urls = proposal.assetRefs.filter(isHttpUrl);
  return {
    key: `design-lab:${proposal.id}`,
    source: 'design-lab',
    sourceId: proposal.id,
    kind: 'taste',
    product: 'jov',
    title: proposal.surfaceName,
    body: proposal.proposalText,
    recommendation: null,
    defaultIfSilent: null,
    recipient: null,
    amountUsd: null,
    evidence: proposal.linearIssueUrl
      ? [...urls, proposal.linearIssueUrl]
      : urls,
    imageUrl: urls[0] ?? null,
    status: proposal.status,
    comment: proposal.reviewNotes,
    createdAt: proposal.createdAt,
    decidedAt: proposal.reviewedAt,
    dayBucket: proposal.dayBucket,
    rejectRequiresComment: true,
  };
}

/** Newest first; ISO strings sort as time. */
export function sortInboxItems(
  items: readonly OvieInboxItem[]
): OvieInboxItem[] {
  return items.toSorted((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function formatInboxAmount(amountUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amountUsd % 1 === 0 ? 0 : 2,
  }).format(amountUsd);
}

/** Swipe distance (px) that commits a touch decision. */
export const OVIE_INBOX_SWIPE_THRESHOLD_PX = 96;

export function decisionFromSwipe(deltaX: number): OvieInboxDecision | null {
  if (deltaX >= OVIE_INBOX_SWIPE_THRESHOLD_PX) return 'approve';
  if (deltaX <= -OVIE_INBOX_SWIPE_THRESHOLD_PX) return 'reject';
  return null;
}

/** Request for the owning decision endpoint, or null if it can't be sent. */
export function buildInboxDecisionRequest(
  item: OvieInboxItem,
  decision: OvieInboxDecision,
  comment: string | null
): { readonly url: string; readonly body: Record<string, unknown> } | null {
  const note = comment?.trim() || null;
  if (item.source === 'summer') {
    return {
      url: `/api/ovie/summer-cards/${encodeURIComponent(item.sourceId)}/decision`,
      body: note ? { decision, comment: note } : { decision },
    };
  }
  if (!item.dayBucket) return null;
  if (decision === 'reject' && !note) return null;
  return {
    url: `/api/admin/design-lab/proposals/${encodeURIComponent(item.sourceId)}/review`,
    body: {
      dayBucket: item.dayBucket,
      decision: decision === 'reject' ? 'no' : note ? 'yes-with-notes' : 'yes',
      notes: note,
    },
  };
}
