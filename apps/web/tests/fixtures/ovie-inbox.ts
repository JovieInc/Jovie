import type { DesignProposal } from '@/lib/agent-os/design-lab/types';
import type { SummerCard } from '@/lib/ovie/summer-cards';

export function summerCard(overrides: Partial<SummerCard> = {}): SummerCard {
  return {
    id: 'sc_00000000000000000000000000000001',
    idempotencyKey: 'key-00000001',
    kind: 'spend',
    product: 'jov',
    title: 'Renew Linear seats',
    body: 'Two seats expire Friday.',
    recommendation: 'Approve the renewal.',
    defaultIfSilent: 'Seats lapse on Friday.',
    recipient: 'Linear',
    amountUsd: 16,
    evidence: ['https://linear.app/billing'],
    status: 'pending',
    comment: null,
    createdAt: '2026-09-26T10:00:00.000Z',
    decidedAt: null,
    ...overrides,
  };
}

export function designProposal(
  overrides: Partial<DesignProposal> = {}
): DesignProposal {
  return {
    id: 'proposal-1',
    surfaceId: 'profile',
    surfaceName: 'Profile Hero',
    proposalText: 'Tighten the hero spacing.',
    assetRefs: ['pen://node', 'https://cdn.example.com/still.png'],
    scoring: null,
    linearIssueId: 'JOV-1',
    linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1',
    status: 'pending',
    createdAt: '2026-09-26T11:00:00.000Z',
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
    reviewDecision: null,
    dispatchId: null,
    dayBucket: '2026-09-26',
    ...overrides,
  };
}
