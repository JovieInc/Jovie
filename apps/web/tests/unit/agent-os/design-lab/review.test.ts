import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';

vi.mock('server-only', () => ({}));

const getDesignProposal = vi.fn();
const saveDesignProposal = vi.fn();
const appendDesignTasteMemoryEntry = vi.fn();
const updateDesignLabLinearIssueStatus = vi.fn();
const createDesignLabLinearIssue = vi.fn();
const triggerDesignLabDispatch = vi.fn();

vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  getDesignProposal,
  saveDesignProposal,
  withDesignProposalLock: async (
    _dayBucket: string,
    _proposalId: string,
    action: () => Promise<unknown>
  ) => action(),
  deriveProposalStatus: (decision: string | null) => {
    if (decision === 'no') return 'rejected';
    if (decision === 'yes' || decision === 'yes-with-notes') return 'approved';
    return 'proposed';
  },
}));

vi.mock('@/lib/agent-os/design-lab/taste-memory', () => ({
  appendDesignTasteMemoryEntry,
}));

vi.mock('@/lib/agent-os/design-lab/linear', () => ({
  createDesignLabLinearIssue,
  updateDesignLabLinearIssueStatus,
}));

vi.mock('@/lib/agent-os/design-lab/dispatch', () => ({
  triggerDesignLabDispatch,
}));

const baseProposal: DesignProposal = {
  id: 'profile-page-quiet-hero',
  kind: 'section-gap',
  surfaceId: 'profile-page',
  surfaceName: 'Public profile page',
  proposalText: 'Use a restrained surface-1 header band.',
  assetRefs: [],
  scoring: { weight: 0.9, score: 0.82 },
  linearIssueId: 'JOV-1951',
  linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1951',
  status: 'proposed',
  designGap: {
    reviewId: 'PROPOSED-SECTION-0001',
    proposedName: 'Quiet hero',
    problem: 'The current hero is too loud.',
    affectedRoutes: ['/'],
    audience: 'Artists',
    conversionGoal: 'Profile visits',
    requiredContentFields: ['title'],
    requiredMedia: [],
    responsiveBehavior: 'Stack on mobile.',
    ctaBehavior: 'One primary CTA.',
    similarSections: [],
    insufficiencyReason: 'No canonical section matches.',
    priority: 'high',
    sectionType: 'hero',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: ['title'],
        layout: 'split',
        contentDensity: 'medium',
        mediaPlacement: 'right',
        responsiveBehavior: 'stack',
        interactionModel: 'static',
        tokens: ['surface'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: ['title'],
        layout: 'stack',
        contentDensity: 'medium',
        mediaPlacement: 'below',
        responsiveBehavior: 'stack',
        interactionModel: 'static',
        tokens: ['surface'],
        placeholderContent: 'grayscale-only',
      },
    },
    openQuestions: [],
    comments: [],
    registryTask: {
      trigger: 'after-approved',
      targetSectionId: 'quiet-hero',
      requiredChanges: ['Implement registry variant'],
      exactFiles: ['apps/web/components/sections/QuietHero.tsx'],
      forbiddenPatterns: ['one-off route JSX'],
      acceptanceCriteria: ['Typed registry component'],
      validationCommands: [
        'pnpm --filter @jovie/web run typecheck -- --pretty false',
      ],
      evidenceRequired: ['desktop screenshot'],
      implementedAt: null,
      evidenceRefs: [],
    },
    modelUsage: [],
  },
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
    createDesignLabLinearIssue.mockResolvedValue({
      identifier: 'JOV-9999',
      url: 'https://linear.app/jovie/issue/JOV-9999',
    });
    triggerDesignLabDispatch.mockResolvedValue({
      triggered: true,
      dispatchId: 'design-lab-test',
    });
  });

  it('approves with yes, dispatches D5, and leaves implementation issue open', async () => {
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
      proposal: expect.objectContaining({
        id: baseProposal.id,
        status: 'approved',
        reviewDecision: 'yes',
      }),
      amendmentNotes: null,
      requestedBy: 'tim@jovie.com',
    });
    expect(appendDesignTasteMemoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'accepted',
        reviewer: 'tim@jovie.com',
      })
    );
    expect(updateDesignLabLinearIssueStatus).not.toHaveBeenCalled();
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
      proposal: expect.objectContaining({
        id: baseProposal.id,
        status: 'approved',
        reviewDecision: 'yes-with-notes',
      }),
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

  it('creates and persists an implementation issue before dispatch', async () => {
    getDesignProposal.mockResolvedValue({
      ...baseProposal,
      linearIssueId: 'UNASSIGNED',
      linearIssueUrl: null,
    });
    const { reviewDesignProposal } = await import(
      '@/lib/agent-os/design-lab/review'
    );

    await reviewDesignProposal({
      dayBucket: '2026-06-08',
      proposalId: baseProposal.id,
      decision: 'yes',
      notes: null,
      reviewer: 'tim@jovie.com',
    });

    expect(createDesignLabLinearIssue).toHaveBeenCalledOnce();
    expect(triggerDesignLabDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({
          linearIssueId: 'JOV-9999',
          linearIssueUrl: 'https://linear.app/jovie/issue/JOV-9999',
        }),
      })
    );
  });

  it('rejects a conflicting decision after review', async () => {
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
        decision: 'no',
        notes: null,
        reviewer: 'tim@jovie.com',
      })
    ).rejects.toThrow('Design proposal has already been reviewed.');
  });

  it('persists approval before dispatch and resumes dispatch idempotently', async () => {
    getDesignProposal.mockResolvedValue({
      ...baseProposal,
      status: 'approved',
      reviewDecision: 'yes',
    });
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
    expect(triggerDesignLabDispatch).toHaveBeenCalledOnce();
    expect(appendDesignTasteMemoryEntry).not.toHaveBeenCalled();
    expect(result.dispatchTriggered).toBe(true);
  });

  it('keeps approval durable when dispatch is unavailable', async () => {
    triggerDesignLabDispatch.mockResolvedValue({
      triggered: false,
      dispatchId: null,
    });
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
    expect(saveDesignProposal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ status: 'reviewing' })
    );
    expect(saveDesignProposal.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ status: 'approved' })
    );
    expect(result.proposal.status).toBe('approved');
    expect(result.dispatchTriggered).toBe(false);
    expect(result.dispatchId).toBeNull();
  });
});
