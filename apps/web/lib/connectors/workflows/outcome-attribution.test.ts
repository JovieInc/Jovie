import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildReleaseGmvRowForRun = vi.hoisted(() => vi.fn());
const mockEnsureJovieActiveCohort = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/release-to-revenue/gmv-attribution', () => ({
  buildReleaseGmvRowForRun: mockBuildReleaseGmvRowForRun,
}));

vi.mock('@/lib/metrics/artist-revenue-cohorts', () => ({
  BASELINE_WINDOW_DAYS: 30,
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
  resolveReleaseOutcomeMeasurementState,
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
  distributionDrafts: {
    releaseLink: 'https://jov.ie/tim/night-drive',
    merchDropLink: 'https://jov.ie/tim/merch/card-1',
    items: [
      {
        id: 'draft-1',
        channel: 'social_post' as const,
        platform: 'instagram' as const,
        variant: 'announcement' as const,
        body: 'Night Drive is out now.',
        status: 'dispatched' as const,
        createdAt: '2026-06-20T12:00:00.000Z',
        decidedAt: '2026-06-20T13:00:00.000Z',
        dispatchedAt: '2026-06-20T13:00:00.000Z',
      },
    ],
  },
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

function mockOutcomeWrite(row: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([row]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate, returning });
  mockDbInsert.mockReturnValue({ values });
  return { onConflictDoUpdate, values };
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
      workflowRunId: 'run-connector-1',
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
      workflowRunId: 'run-1',
      kind: 'release_to_revenue',
      userId: 'user-1',
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      stepOutputs: releaseStepOutputs,
      completedAt: new Date('2026-06-21T00:00:00.000Z'),
      asOf: new Date('2026-06-25T00:00:00.000Z'),
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
    expect(deltas.window.end).toEqual(new Date('2026-06-25T00:00:00.000Z'));
    expect(mockBuildReleaseGmvRowForRun).toHaveBeenCalledWith({
      workflowRunId: 'run-1',
      stepOutputs: releaseStepOutputs,
      window: {
        start: new Date('2026-06-20T12:00:00.000Z'),
        end: new Date('2026-06-25T00:00:00.000Z'),
      },
    });
  });

  it('caps a release outcome at the canonical 30-day maturity point', async () => {
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 0 }]));

    const deltas = await computeWorkflowRunOutcomeDeltas({
      workflowRunId: 'run-1',
      kind: 'release_to_revenue',
      userId: 'user-1',
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      stepOutputs: releaseStepOutputs,
      completedAt: new Date('2026-06-21T00:00:00.000Z'),
      asOf: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(deltas.window).toEqual({
      start: new Date('2026-06-20T12:00:00.000Z'),
      end: new Date('2026-07-20T12:00:00.000Z'),
    });
  });
});

describe('resolveReleaseOutcomeMeasurementState', () => {
  const windowStart = new Date('2026-06-20T12:00:00.000Z');
  const zeroMetrics = {
    gmvDeltaCents: 0,
    clickDelta: 0,
    dspClickDelta: 0,
    newFansDelta: 0,
  };

  it.each([
    {
      name: 'measuring before maturity even with an early signal',
      windowEnd: new Date('2026-07-20T11:59:59.999Z'),
      metrics: { ...zeroMetrics, dspClickDelta: 1 },
      expected: 'measuring',
    },
    {
      name: 'measured_zero at maturity with no result',
      windowEnd: new Date('2026-07-20T12:00:00.000Z'),
      metrics: zeroMetrics,
      expected: 'measured_zero',
    },
    {
      name: 'measured_positive at maturity with a result',
      windowEnd: new Date('2026-07-20T12:00:00.000Z'),
      metrics: { ...zeroMetrics, newFansDelta: 1 },
      expected: 'measured_positive',
    },
  ] as const)('$name', ({ expected, metrics, windowEnd }) => {
    expect(
      resolveReleaseOutcomeMeasurementState({
        windowStart,
        windowEnd,
        ...metrics,
      })
    ).toBe(expected);
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

  it('writes one durable outcome row for the first real release activation', async () => {
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

    const write = mockOutcomeWrite({
      workflowRunId: 'run-1',
      userId: 'user-1',
      releaseId: 'release-1',
      suggestedActionId: null,
      gmvDeltaCents: 1800,
      clickDelta: 4,
      dspClickDelta: 2,
      newFansDelta: 1,
      windowStart: new Date('2026-06-20T12:00:00.000Z'),
      windowEnd: new Date('2026-06-25T00:00:00.000Z'),
    });

    const outcome = await recordWorkflowRunOutcome('run-1', {
      asOf: new Date('2026-06-25T00:00:00.000Z'),
    });

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
    expect(write.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(mockEnsureJovieActiveCohort).toHaveBeenCalledWith({
      userId: 'user-1',
      activatedAt: new Date('2026-06-20T13:00:00.000Z'),
    });
  });

  it('preserves immutable early-return behavior for generic workflows', async () => {
    const existingOutcome = {
      workflowRunId: 'run-connector-1',
      userId: 'user-1',
      releaseId: null,
      suggestedActionId: 'approval-1',
      gmvDeltaCents: 0,
      clickDelta: 0,
      dspClickDelta: 0,
      newFansDelta: 0,
      windowStart: new Date('2026-06-19T00:00:00.000Z'),
      windowEnd: new Date('2026-06-21T00:00:00.000Z'),
    };

    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'run-connector-1',
            kind: 'execute_approved_action',
            userId: 'user-1',
            status: 'completed',
            createdAt: new Date('2026-06-19T00:00:00.000Z'),
            updatedAt: new Date('2026-06-21T00:00:00.000Z'),
            stepOutputs: { approvalId: 'approval-1' },
          },
        ])
      )
      .mockReturnValueOnce(mockSelectChain([{ id: 'outcome-1' }]))
      .mockReturnValueOnce(mockSelectChain([existingOutcome]));

    const outcome = await recordWorkflowRunOutcome('run-connector-1');

    expect(outcome).toMatchObject({
      workflowRunId: 'run-connector-1',
      suggestedActionId: 'approval-1',
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnsureJovieActiveCohort).not.toHaveBeenCalled();
  });

  it('recomputes and upserts an existing release outcome without reactivating the cohort', async () => {
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
      .mockReturnValueOnce(mockSelectChain([{ id: 'outcome-1' }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 12 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 7 }]))
      .mockReturnValueOnce(mockSelectChain([{ count: 3 }]));
    const write = mockOutcomeWrite({
      workflowRunId: 'run-1',
      userId: 'user-1',
      releaseId: 'release-1',
      suggestedActionId: null,
      gmvDeltaCents: 1800,
      clickDelta: 12,
      dspClickDelta: 7,
      newFansDelta: 3,
      windowStart: new Date('2026-06-20T12:00:00.000Z'),
      windowEnd: new Date('2026-07-20T12:00:00.000Z'),
    });

    const outcome = await recordWorkflowRunOutcome('run-1', {
      asOf: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(outcome).toMatchObject({
      workflowRunId: 'run-1',
      clickDelta: 12,
      dspClickDelta: 7,
      newFansDelta: 3,
      windowEnd: new Date('2026-07-20T12:00:00.000Z'),
    });
    expect(write.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(mockEnsureJovieActiveCohort).not.toHaveBeenCalled();
  });

  it('does not persist or activate an all-rejected release run', async () => {
    const rejectedStepOutputs = {
      ...releaseStepOutputs,
      distributionDrafts: {
        ...releaseStepOutputs.distributionDrafts,
        items: releaseStepOutputs.distributionDrafts.items.map(draft => ({
          ...draft,
          status: 'rejected' as const,
          dispatchedAt: undefined,
        })),
      },
    };
    mockDbSelect.mockReturnValueOnce(
      mockSelectChain([
        {
          id: 'run-1',
          kind: 'release_to_revenue',
          userId: 'user-1',
          status: 'completed',
          createdAt: new Date('2026-06-19T00:00:00.000Z'),
          updatedAt: new Date('2026-06-21T00:00:00.000Z'),
          stepOutputs: rejectedStepOutputs,
        },
      ])
    );

    await expect(recordWorkflowRunOutcome('run-1')).resolves.toBeNull();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
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
