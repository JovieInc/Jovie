import { beforeEach, describe, expect, it, vi } from 'vitest';
import { designProposal, summerCard } from '@/tests/fixtures/ovie-inbox';
import { buildOvieInbox } from './inbox.server';

const mocks = vi.hoisted(() => ({
  listSummerCards: vi.fn(),
  listPendingDesignProposals: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('./summer-cards.server', () => ({
  listSummerCards: mocks.listSummerCards,
}));
vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: mocks.listPendingDesignProposals,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

describe('buildOvieInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges pending Summer cards and taste proposals newest first', async () => {
    mocks.listSummerCards.mockImplementation(
      async ({ status }: { status: string }) =>
        status === 'pending'
          ? [summerCard()]
          : [
              summerCard({
                id: 'sc_00000000000000000000000000000002',
                status: 'approved',
                decidedAt: '2026-09-26T12:00:00.000Z',
              }),
            ]
    );
    mocks.listPendingDesignProposals.mockResolvedValue([
      designProposal(),
      designProposal({ id: 'done', status: 'approved' }),
    ]);

    const inbox = await buildOvieInbox();

    expect(inbox.pending.map(item => item.key)).toEqual([
      'design-lab:proposal-1',
      'summer:sc_00000000000000000000000000000001',
    ]);
    expect(inbox.decided.map(item => item.status)).toEqual(['approved']);
    expect(inbox.sources).toEqual({ summer: 'ok', 'design-lab': 'ok' });
  });

  it('names the broken source instead of blanking the inbox', async () => {
    mocks.listSummerCards.mockRejectedValue(new Error('db down'));
    mocks.listPendingDesignProposals.mockResolvedValue([designProposal()]);

    const inbox = await buildOvieInbox();

    expect(inbox.sources).toEqual({ summer: 'error', 'design-lab': 'ok' });
    expect(inbox.pending).toHaveLength(1);
    expect(mocks.captureError).toHaveBeenCalled();
  });
});
