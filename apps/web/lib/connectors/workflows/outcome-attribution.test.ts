import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildReleaseGmvRowForRun = vi.hoisted(() => vi.fn());
const mockEnsureJovieActiveCohort = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/release-to-revenue/gmv-attribution', () => ({
  buildReleaseGmvRowForRun: mockBuildReleaseGmvRowForRun,
}));

vi.mock('@/lib/metrics/artist-revenue-cohorts', () => ({
  ensureJovieActiveCohort: mockEnsureJovieActiveCohort,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

import {
  computeWorkflowRunOutcomeDeltas,
  getAutomationAttributedRevenueForRun,
  recordWorkflowRunOutcome,
  sumArtistAutomationAttributedRevenue,
} from './outcome-attribution';

const releaseStepOutputs = {
  releaseId: 'release-1',
  triggerSource: 'catalog' as const,
  triggeredAt: '2026-06-20T12:00:00.000Z',
  designPartner: {
    creatorUsername: 'tim',
    creatorProfileId: 'profile-1',
    userId: 'user-1',
    store: { provider: 'printful' as const, scope: 'default' as const },
    socialAccount: { platform: 'instagram' as const, handle: 'tim' },
    smsListId: 'sms-1',
  },
  release: {
    title: 'Night Drive',
    artworkUrl: null,
    links: [],
  },
  storeListing: { merchCardIds: ['card-1'] },
};

function mockSelectChain(rows: unknown[]) {
  const whereResult = Promise.resolve(rows);
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(
        Object.assign(whereResult, {
          limit: vi.fn().mockResolvedValue(rows),
        })
      ),
    }),
  };
}

describe('computeWorkflowRunOutcomeDeltas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildReleaseGmvRowForRun.mockResolvedValue({
      workflowRunId: 'run-1',
      releaseId: 'release-1',
      releaseTitle: 'Night Drive',
      triggeredAt: '2026-06-20T12:00:00.000Z',
      merchCardIds: ['card-1'],
      orderCount: 2,
      gmvCents: 4200,
    });
  });

  it('returns zeroed deltas for connector execute_approved_action runs', async () => {
    const deltas = await computeWorkflowRunOutcomeDeltas({
      kind: 'execute_approved_action',
      userId: 'user-1',
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      stepOutputs: { approvalId: 'approval-1' },
      completedAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    expect(deltas).toMatchObject({
      releaseId: null,
      suggestedActionId: 'approval-1',
      creatorProfileId: null,
      gmvDeltaCents: 0,
      clickDelta: 0,
      dspClickDelta: 0,
      newFansDelta: 0,
    });
    expect(deltas.window.start).toEqual(new Date('2026-06-19T00:00:00.000Z'));
    expect(deltas.window.end).toEqual(new Date('2026-06-21T00:00:00.000Z'));
    expect(mockBuildReleaseGmvRowForRun).not.toHaveBeenCalled();
  });

  it('rolls up release GMV and engagement deltas for release_to_revenue runs', async () => {
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([{ count: 12 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 7 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 3 }]));

    const deltas = await computeWorkflowRunOutcomeDeltas({
      kind: 'release_to_revenue',
      userId: 'user-1',
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      stepOutputs: releaseStepOutputs,
      completedAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    expect(deltas).toMatchObject({
      releaseId: 'release-1',
      suggestedActionId: null,
      creatorProfileId: 'profile-1',
      gmvDeltaCents: 4200,
      clickDelta: 12,
      dspClickDelta: 7,
      newFansDelta: 3,
    });
    expect(deltas.window.start).toEqual(new Date('2026-06-20T12:00:00.000Z'));
    expect(mockBuildReleaseGmvRowForRun).toHaveBeenCalledWith({
      workflowRunId: 'pending',
      stepOutputs: releaseStepOutputs,
    });
  });
});

describe('recordWorkflowRunOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildReleaseGmvRowForRun.mockResolvedValue({
      workflowRunId: 'run-1',
      releaseId: 'release-1',
      releaseTitle: 'Night Drive',
      triggeredAt: '2026-06-20T12:00:00.000Z',
      merchCardIds: ['card-1'],
      orderCount: 1,
      gmvCents: 1800,
    });
  });

  it('writes one durable outcome row when a completed run is recorded', async () => {
    const completedRun = {
      id: 'run-1',
      kind: 'release_to_revenue',
      userId: 'user-1',
      status: 'completed',
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z'),
      stepOutputs: releaseStepOutputs,
    };

    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([completedRun]))
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(mockSelectChain([{ count: 4 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 1 }]));

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            workflowRunId: 'run-1',
            userId: 'user-1',
            releaseId: 'release-1',
            suggestedActionId: null,
            gmvDeltaCents: 1800,
            clickDelta: 4,
            dspClickDelta: 2,
            newFansDelta: 1,
            windowStart: new Date('2026-06-20T12:00:00.000Z'),
            windowEnd: new Date('2026-06-21T00:00:00.000Z'),
          },
        ]),
      }),
    });

    const outcome = await recordWorkflowRunOutcome('run-1');

    expect(outcome).toMatchObject({
      workflowRunId: 'run-1',
      userId: 'user-1',
      releaseId: 'release-1',
      gmvDeltaCents: 1800,
      clickDelta: 4,
      dspClickDelta: 2,
      newFansDelta: 1,
    });
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockEnsureJovieActiveCohort).toHaveBeenCalledWith({
      userId: 'user-1',
      activatedAt: new Date('2026-06-21T00:00:00.000Z'),
    });
  });

  it('is idempotent when an outcome row already exists', async () => {
    const existingOutcome = {
      workflowRunId: 'run-1',
      userId: 'user-1',
      releaseId: 'release-1',
      suggestedActionId: null,
      gmvDeltaCents: 900,
      clickDelta: 1,
      dspClickDelta: 1,
      newFansDelta: 0,
      windowStart: new Date('2026-06-20T12:00:00.000Z'),
      windowEnd: new Date('2026-06-21T00:00:00.000Z'),
    };

    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'run-1',
            kind: 'release_to_revenue',
            userId: 'user-1',
            status: 'completed',
            createdAt: new Date('2026-06-19T00:00:00.000Z'),
            updatedAt: new Date('2026-06-21T00:00:00.000Z'),
            stepOutputs: releaseStepOutputs,
          },
        ])
      )
      .mockReturnValueOnce(mockSelectChain([{ id: 'outcome-1' }]))
      .mockReturnValueOnce(mockSelectChain([existingOutcome]));

    const outcome = await recordWorkflowRunOutcome('run-1');

    expect(outcome).toMatchObject({
      workflowRunId: 'run-1',
      gmvDeltaCents: 900,
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnsureJovieActiveCohort).not.toHaveBeenCalled();
  });
});

describe('attribution queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stored automation_attributed_revenue for a run', async () => {
    mockDbSelect.mockReturnValue(
      mockSelectChain([
        {
          workflowRunId: 'run-9',
          userId: 'user-9',
          releaseId: 'release-9',
          suggestedActionId: null,
          gmvDeltaCents: 5000,
          clickDelta: 8,
          dspClickDelta: 5,
          newFansDelta: 2,
          windowStart: new Date('2026-06-01T00:00:00.000Z'),
          windowEnd: new Date('2026-06-30T00:00:00.000Z'),
        },
      ])
    );

    const outcome = await getAutomationAttributedRevenueForRun('run-9');

    expect(outcome).toMatchObject({
      workflowRunId: 'run-9',
      gmvDeltaCents: 5000,
      clickDelta: 8,
      dspClickDelta: 5,
      newFansDelta: 2,
    });
  });

  it('sums artist revenue_lift across completed runs in a window', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            runCount: 3,
            gmvDeltaCents: 12500,
            clickDelta: 40,
            dspClickDelta: 18,
            newFansDelta: 6,
          },
        ]),
      }),
    });

    const summary = await sumArtistAutomationAttributedRevenue({
      userId: 'user-1',
      windowStart: new Date('2026-06-01T00:00:00.000Z'),
      windowEnd: new Date('2026-06-30T00:00:00.000Z'),
    });

    expect(summary).toEqual({
      userId: 'user-1',
      windowStart: new Date('2026-06-01T00:00:00.000Z'),
      windowEnd: new Date('2026-06-30T00:00:00.000Z'),
      runCount: 3,
      gmvDeltaCents: 12500,
      clickDelta: 40,
      dspClickDelta: 18,
      newFansDelta: 6,
    });
  });
});
