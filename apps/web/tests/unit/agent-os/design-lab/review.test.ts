import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';

vi.mock('server-only', () => ({}));

const getDesignProposal = vi.fn();
const saveDesignProposal = vi.fn();
const appendDesignTasteMemoryEntry = vi.fn();
const updateDesignLabLinearIssueStatus = vi.fn();
const triggerDesignLabDispatch = vi.fn();

vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  getDesignProposal,
  saveDesignProposal,
  deriveProposalStatus: (decision: string | null) => {
    if (decision === 'no') return 'rejected';
    if (decision === 'yes' || decision === 'yes-with-notes') return 'approved';
    return 'pending';
  },
}));

vi.mock('@/lib/agent-os/design-lab/taste-memory', () => ({
  appendDesignTasteMemoryEntry,
}));

vi.mock('@/lib/agent-os/design-lab/linear', () => ({
  updateDesignLabLinearIssueStatus,
}));

vi.mock('@/lib/agent-os/design-lab/dispatch', () => ({
  triggerDesignLabDispatch,
}));

const baseProposal: DesignProposal = {
  id: 'profile-page-quiet-hero',
  surfaceId: 'profile-page',
  surfaceName: 'Public profile page',
  proposalText: 'Use a restrained surface-1 header band.',
  assetRefs: [],
  scoring: { weight: 0.9, score: 0.82 },
  linearIssueId: 'JOV-1951',
  linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1951',
  status: 'pending',
  createdAt: '2026-06-08T12:00:00.000Z',
  reviewedAt: null,
  reviewer: null,
  reviewNotes: null,
  reviewDecision: null,
  dispatchId: null,
  dayBucket: '2026-06-08',
};

describe('reviewDesignProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDesignProposal.mockResolvedValue(baseProposal);
    saveDesignProposal.mockResolvedValue(undefined);
    appendDesignTasteMemoryEntry.mockResolvedValue(undefined);
    updateDesignLabLinearIssueStatus.mockResolvedValue(true);
    triggerDesignLabDispatch.mockResolvedValue({
      triggered: true,
      dispatchId: 'design-lab-test',
    });
  });

  it('approves with yes, dispatches D5, and completes Linear issue', async () => {
    const { reviewDesignProposal } = await import(
      '@/lib/agent-os/design-lab/review'
    );

    const result = await reviewDesignProposal({
      dayBucket: '2026-06-08',
      proposalId: baseProposal.id,
      decision: 'yes',
      notes: null,
      reviewer: 'tim@jovie.com',
    });

    expect(triggerDesignLabDispatch).toHaveBeenCalledWith({
      proposal: baseProposal,
      amendmentNotes: null,
      requestedBy: 'tim@jovie.com',
    });
    expect(appendDesignTasteMemoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'accepted',
        reviewer: 'tim@jovie.com',
      })
    );
    expect(updateDesignLabLinearIssueStatus).toHaveBeenCalledWith(
      'JOV-1951',
      'completed'
    );
    expect(saveDesignProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        reviewDecision: 'yes',
        dispatchId: 'design-lab-test',
      })
    );
    expect(result.dispatchTriggered).toBe(true);
  });

  it('rejects with no, skips dispatch, and cancels Linear issue', async () => {
    const { reviewDesignProposal } = await import(
      '@/lib/agent-os/design-lab/review'
    );

    const result = await reviewDesignProposal({
      dayBucket: '2026-06-08',
      proposalId: baseProposal.id,
      decision: 'no',
      notes: 'Too loud for our restrained aesthetic.',
      reviewer: 'tim@jovie.com',
    });

    expect(triggerDesignLabDispatch).not.toHaveBeenCalled();
    expect(appendDesignTasteMemoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'rejected',
        notes: 'Too loud for our restrained aesthetic.',
      })
    );
    expect(updateDesignLabLinearIssueStatus).toHaveBeenCalledWith(
      'JOV-1951',
      'canceled'
    );
    expect(saveDesignProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        reviewDecision: 'no',
        dispatchId: null,
      })
    );
    expect(result.dispatchTriggered).toBe(false);
  });

  it('approves with notes and injects amendments into dispatch', async () => {
    const { reviewDesignProposal } = await import(
      '@/lib/agent-os/design-lab/review'
    );

    await reviewDesignProposal({
      dayBucket: '2026-06-08',
      proposalId: baseProposal.id,
      decision: 'yes-with-notes',
      notes: 'Keep the underline but reduce accent saturation.',
      reviewer: 'tim@jovie.com',
    });

    expect(triggerDesignLabDispatch).toHaveBeenCalledWith({
      proposal: baseProposal,
      amendmentNotes: 'Keep the underline but reduce accent saturation.',
      requestedBy: 'tim@jovie.com',
    });
    expect(saveDesignProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        reviewDecision: 'yes-with-notes',
        reviewNotes: 'Keep the underline but reduce accent saturation.',
      })
    );
  });

  it('throws when proposal was already reviewed', async () => {
    getDesignProposal.mockResolvedValue({
      ...baseProposal,
      status: 'approved',
    });

    const { reviewDesignProposal } = await import(
      '@/lib/agent-os/design-lab/review'
    );

    await expect(
      reviewDesignProposal({
        dayBucket: '2026-06-08',
        proposalId: baseProposal.id,
        decision: 'yes',
        notes: null,
        reviewer: 'tim@jovie.com',
      })
    ).rejects.toThrow('Design proposal has already been reviewed.');
  });
});
