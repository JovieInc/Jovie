import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockEq, mockMarkWorkflowFailed } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockMarkWorkflowFailed: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: mockEq,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/connectors/workflows/execute-approved-action', () => ({
  markWorkflowFailed: mockMarkWorkflowFailed,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const { mockGenerateDistributionDraftsForRun } = vi.hoisted(() => ({
  mockGenerateDistributionDraftsForRun: vi.fn(),
}));

vi.mock('../distribution-drafts', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../distribution-drafts')>();
  return {
    ...actual,
    generateDistributionDraftsForRun: mockGenerateDistributionDraftsForRun,
  };
});

import { DISTRIBUTION_DRAFT_EXPECTED_COUNTS } from '../distribution-drafts';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '../types';
import { initializeReleaseToRevenueRun } from './initialize-run';

describe('initializeReleaseToRevenueRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateDistributionDraftsForRun.mockResolvedValue({
      releaseLink: 'https://jov.ie/timwhite/launch-track',
      merchDropLink: 'https://jov.ie/timwhite/merch',
      items: Array.from(
        { length: DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total },
        (_, index) => ({
          id: `draft-${index}`,
          channel:
            index < DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
              ? 'social_post'
              : 'sms',
          platform:
            index < DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
              ? 'instagram'
              : 'sms',
          variant: 'announcement',
          body: `Draft ${index}`,
          status: 'pending',
          createdAt: '2026-06-20T08:00:00.000Z',
        })
      ),
    });
  });

  it('marks valid runs as waiting_for_approval', async () => {
    const selectLimit = vi.fn().mockResolvedValue([
      {
        id: 'run-1',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        stepOutputs: {
          releaseId: 'release-1',
          release: { title: 'Launch Track' },
        },
      },
    ]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    mockDb.select.mockReturnValue({ from: selectFrom });

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReturnValue({ set: updateSet });

    await initializeReleaseToRevenueRun({ workflowRunId: 'run-1' });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'waiting_for_approval',
        currentStep: 'awaiting_approval',
        stepOutputs: expect.objectContaining({
          distributionDrafts: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ status: 'pending' }),
            ]),
          }),
        }),
      })
    );
    expect(
      updateSet.mock.calls[0]?.[0].stepOutputs.distributionDrafts.items
    ).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total);
    expect(mockMarkWorkflowFailed).not.toHaveBeenCalled();
  });

  it('fails when release metadata is missing', async () => {
    const selectLimit = vi.fn().mockResolvedValue([
      {
        id: 'run-2',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        stepOutputs: { releaseId: null },
      },
    ]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    mockDb.select.mockReturnValue({ from: selectFrom });

    await initializeReleaseToRevenueRun({ workflowRunId: 'run-2' });

    expect(mockMarkWorkflowFailed).toHaveBeenCalledWith(
      'run-2',
      'release_to_revenue run is missing release metadata'
    );
  });
});
