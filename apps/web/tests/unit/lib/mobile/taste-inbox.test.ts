import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  listPendingDesignProposals: vi.fn(),
  listSummerCards: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: hoisted.listPendingDesignProposals,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  listSummerCards: hoisted.listSummerCards,
}));

describe('buildMobileTasteInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listSummerCards.mockResolvedValue([]);
  });

  it('uses post-land design proposals without a human-label intake queue', async () => {
    hoisted.listPendingDesignProposals.mockResolvedValue([
      {
        id: 'proposal-1',
        surfaceId: 'homepage',
        surfaceName: 'Homepage',
        proposalText: 'Certify the flag-off homepage variant.',
        assetRefs: ['https://example.com/homepage.png'],
        scoring: null,
        linearIssueId: 'JOV-5960',
        linearIssueUrl: null,
        status: 'pending',
        createdAt: '2026-09-05T10:00:00.000Z',
        reviewedAt: null,
        reviewer: null,
        reviewNotes: null,
        reviewDecision: null,
        dispatchId: null,
        dayBucket: '2026-09-05',
      },
    ]);

    const { buildMobileTasteInbox } = await import('@/lib/mobile/taste-inbox');
    const inbox = await buildMobileTasteInbox();

    expect(inbox.pendingCount).toBe(1);
    expect(inbox.items[0]).toMatchObject({
      typeLabel: 'Still',
      title: 'Homepage',
      status: 'pending',
    });
    expect(JSON.stringify(inbox)).not.toMatch(
      /needs-human|needs:human|no-auto/
    );
  });

  it('lists pending Summer cards next to Design Lab proposals, newest first', async () => {
    hoisted.listPendingDesignProposals.mockResolvedValue([
      {
        id: 'proposal-1',
        surfaceId: 'homepage',
        surfaceName: 'Homepage',
        proposalText: 'Certify the flag-off homepage variant.',
        assetRefs: [],
        scoring: null,
        linearIssueId: null,
        linearIssueUrl: null,
        status: 'pending',
        createdAt: '2026-09-05T10:00:00.000Z',
        reviewedAt: null,
        reviewer: null,
        reviewNotes: null,
        reviewDecision: null,
        dispatchId: null,
        dayBucket: '2026-09-05',
      },
    ]);
    hoisted.listSummerCards.mockResolvedValue([
      {
        id: 'sc_0123456789abcdef0123456789abcdef',
        idempotencyKey: 'outreach-0001',
        kind: 'outbound',
        product: 'jov',
        title: 'Email 12 claimed artists',
        body: 'Hi, ...',
        recommendation: 'Send it',
        defaultIfSilent: null,
        recipient: 'claimed artists',
        amountUsd: null,
        evidence: [],
        status: 'pending',
        comment: null,
        createdAt: '2026-09-06T10:00:00.000Z',
        decidedAt: null,
      },
    ]);

    const { buildMobileTasteInbox } = await import('@/lib/mobile/taste-inbox');
    const inbox = await buildMobileTasteInbox();

    expect(hoisted.listSummerCards).toHaveBeenCalledWith({
      status: 'pending',
      limit: 100,
    });
    expect(inbox.pendingCount).toBe(2);
    expect(inbox.items.map(item => item.id)).toEqual([
      'summer-card:sc_0123456789abcdef0123456789abcdef',
      'proposal:2026-09-05:proposal-1',
    ]);
    expect(inbox.items[0]).toMatchObject({
      typeLabel: 'Outbound',
      title: 'Email 12 claimed artists',
      why: 'Send it',
      status: 'pending',
      imageUrl: null,
    });
    expect(inbox.items[1]).toMatchObject({ typeLabel: 'Card' });
  });
});
