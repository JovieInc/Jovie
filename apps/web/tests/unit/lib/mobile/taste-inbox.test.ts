import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  listPendingDesignProposals: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: hoisted.listPendingDesignProposals,
}));

describe('buildMobileTasteInbox', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
