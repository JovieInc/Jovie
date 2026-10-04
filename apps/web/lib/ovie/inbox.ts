import type { DesignProposal } from '@/lib/agent-os/design-lab/types';
import type { VisualQaReviewRun } from '@/lib/agent-os/visual-qa/review';
import type { TimActionsResponse } from '@/lib/hud/linear-actions';
import type { OvieCertificationInventory } from './certifications/types';
import {
  INTERACTION_CASE_CONTRACT,
  type InteractionCase,
  rankInteractionCases,
} from './interaction-case';
import type { SummerCard } from './summer-cards';

export type InboxDecisionTarget =
  | { readonly kind: 'visual'; readonly id: string; readonly surfaceId: string }
  | { readonly kind: 'linear'; readonly id: string }
  | { readonly kind: 'design'; readonly id: string; readonly dayBucket: string }
  | { readonly kind: 'summer'; readonly id: string }
  | {
      readonly kind: 'certification';
      readonly id: string;
      readonly evidenceDigest: string;
    };

export interface OvieInboxCase extends InteractionCase {
  readonly decisionTarget: InboxDecisionTarget | null;
  readonly body: string;
}

export interface OvieInbox {
  readonly cases: readonly OvieInboxCase[];
  readonly issues: readonly string[];
}

const pending = {
  contract: INTERACTION_CASE_CONTRACT,
  state: 'needs_you',
  owner: 'founder',
  nextAction: 'Review the recommendation',
  waitingUntil: null,
  confidence: null,
} as const;

/** Source IDs and decision tokens remain owned by their existing domain stores. */
export function projectOvieInbox(
  proposals: readonly DesignProposal[],
  cards: readonly SummerCard[],
  inventory: OvieCertificationInventory | null,
  visualRuns: readonly VisualQaReviewRun[] = [],
  linear?: TimActionsResponse
): OvieInbox {
  const cases: OvieInboxCase[] = [];
  for (const proposal of proposals.filter(item => item.status === 'pending')) {
    cases.push({
      ...pending,
      state: proposal.dayBucket ? 'needs_you' : 'waiting',
      id: `proposal:${proposal.dayBucket ?? 'none'}:${proposal.id}`,
      kind: 'design',
      source: {
        system: 'design',
        id: proposal.id,
        revision: proposal.dayBucket,
      },
      title: proposal.surfaceName,
      body: proposal.proposalText,
      recommendation: proposal.proposalText,
      priority: 2,
      createdAt: proposal.createdAt,
      evidence: proposal.assetRefs,
      decisionTarget: proposal.dayBucket
        ? { kind: 'design', id: proposal.id, dayBucket: proposal.dayBucket }
        : null,
    });
  }
  for (const card of cards.filter(item => item.status === 'pending')) {
    cases.push({
      ...pending,
      id: `summer-card:${card.id}`,
      kind: card.kind === 'spend' ? 'spend' : 'autonomous_action',
      source: { system: 'summer', id: card.id, revision: null },
      title: card.title,
      body: [
        card.body,
        card.recipient ? `Recipient: ${card.recipient}` : null,
        card.amountUsd !== null ? `Amount: USD ${card.amountUsd}` : null,
        card.defaultIfSilent ? `If silent: ${card.defaultIfSilent}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      recommendation: card.recommendation,
      priority: card.kind === 'spend' || card.kind === 'outbound' ? 1 : 2,
      createdAt: card.createdAt,
      evidence: card.evidence,
      decisionTarget: { kind: 'summer', id: card.id },
    });
  }
  for (const row of (inventory?.rows ?? []).filter(
    item =>
      item.state === 'review_ready' &&
      inventory?.queue.needsYou.some(
        candidate =>
          candidate.subject.id === item.subject.id &&
          candidate.decisionEvidenceDigest === item.decision.evidenceDigest
      )
  )) {
    cases.push({
      ...pending,
      state:
        row.decision.available && row.decision.evidenceDigest
          ? 'needs_you'
          : 'waiting',
      id: `certification:${row.id}`,
      kind: 'certification',
      source: {
        system: 'certification',
        id: row.id,
        revision: row.decision.evidenceDigest,
      },
      title: row.subject.title,
      body: [
        row.surface,
        ...row.blockers.map(item => item.summary),
        ...row.evidence.map(
          item => `${item.tier}: ${item.status} — ${item.summary} (${item.ref})`
        ),
      ].join('\n'),
      recommendation:
        row.decision.reason ??
        'Review the evidence and certify or request changes.',
      priority: 2,
      createdAt: row.updatedAt,
      evidence: [
        ...new Set([
          ...row.links.map(link => link.href),
          ...row.evidence.flatMap(evidence =>
            evidence.href ? [evidence.href] : []
          ),
        ]),
      ],
      decisionTarget:
        row.decision.available && row.decision.evidenceDigest
          ? {
              kind: 'certification',
              id: row.id,
              evidenceDigest: row.decision.evidenceDigest,
            }
          : null,
    });
  }
  for (const run of visualRuns) {
    for (const surface of run.surfaces.filter(
      entry => !entry.review && entry.status === 'drift_detected'
    )) {
      cases.push({
        ...pending,
        id: `visual:${run.runId}:${surface.surfaceId}`,
        kind: 'design',
        source: {
          system: 'visual',
          id: surface.surfaceId,
          revision: run.runId,
        },
        title: surface.title,
        body: 'Compare the deployed screenshots before accepting the change.',
        recommendation: 'Accept intentional changes or reject regressions.',
        priority: 2,
        createdAt: run.computedAt,
        evidence: ['baseline', 'after', 'overlay'].map(
          kind =>
            `/api/admin/hud/visual-qa/${encodeURIComponent(run.runId)}/${encodeURIComponent(surface.surfaceId)}/${kind}`
        ),
        decisionTarget: {
          kind: 'visual',
          id: run.runId,
          surfaceId: surface.surfaceId,
        },
      });
    }
  }
  for (const issue of linear?.issues ?? []) {
    cases.push({
      ...pending,
      id: `linear:${issue.id}`,
      kind: 'portfolio',
      source: { system: 'linear', id: issue.id, revision: null },
      title: issue.title,
      body: `Review ${issue.identifier} and complete the requested work before marking it done.`,
      recommendation:
        'Open the linked work for its evidence and completion criteria.',
      priority: issue.priority || 5,
      createdAt: issue.createdAt,
      evidence: [issue.url],
      decisionTarget: { kind: 'linear', id: issue.id },
    });
  }
  return {
    cases: rankInteractionCases(cases),
    issues: [
      ...(inventory?.issues.map(issue => issue.message) ?? []),
      ...(linear && !['ok', 'empty'].includes(linear.observation)
        ? [linear.errorMessage ?? 'Requested work is unavailable.']
        : []),
      ...(inventory?.domains ?? [])
        .filter(
          domain =>
            domain.status === 'not_connected' || domain.status === 'error'
        )
        .map(
          domain => `${domain.label}: ${domain.note ?? 'source unavailable'}`
        ),
      ...cases
        .filter(item => !item.decisionTarget)
        .map(item => `${item.title}: additional evidence is required.`),
    ],
  };
}

/** Build requests only for known adapters; a case never grants action authority. */
export function inboxDecisionRequest(
  target: InboxDecisionTarget,
  decision: 'approve' | 'reject' | 'modify',
  notes: string,
  actionId: string
) {
  if (decision !== 'approve' && !notes.trim())
    throw new Error('Add a reason or requested changes.');
  switch (target.kind) {
    case 'linear':
      if (decision !== 'approve')
        throw new Error('Update this request in its linked work.');
      return {
        url: '/api/admin/hud/tim-actions',
        body: { issueId: target.id },
      };
    case 'visual':
      if (decision === 'modify')
        throw new Error('Reject with notes to request changes.');
      return {
        url: `/api/admin/hud/visual-qa/${encodeURIComponent(target.id)}/review`,
        body: {
          surfaceId: target.surfaceId,
          decision: decision === 'approve' ? 'accepted' : 'rejected',
          notes: notes.trim() || undefined,
        },
      };
    case 'design':
      if (decision === 'modify')
        throw new Error('Reject with notes to request changes.');
      return {
        url: `/api/admin/design-lab/proposals/${encodeURIComponent(target.id)}/review`,
        body: {
          dayBucket: target.dayBucket,
          decision:
            decision === 'reject'
              ? 'no'
              : notes.trim()
                ? 'yes-with-notes'
                : 'yes',
          notes: notes.trim() || null,
        },
      };
    case 'summer':
      if (decision === 'modify')
        throw new Error('Request changes by rejecting with a comment.');
      return {
        url: `/api/ovie/summer-cards/${encodeURIComponent(target.id)}/decision`,
        body: { decision, comment: notes.trim() || undefined },
      };
    case 'certification':
      return {
        url: '/api/ovie/certifications/decisions',
        body: {
          rowId: target.id,
          evidenceDigest: target.evidenceDigest,
          decision:
            decision === 'approve'
              ? 'approved'
              : decision === 'reject'
                ? 'rejected'
                : 'changes_requested',
          notes: notes.trim() || null,
          actionId,
        },
      };
  }
}
