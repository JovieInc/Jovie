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

const mockSyncStoreListingForRun = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ merchCardIds: ['card-1'] })
);

vi.mock('../store-listing', () => ({
  syncStoreListingForRun: mockSyncStoreListingForRun,
}));

import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '../types';
import { initializeReleaseToRevenueRun } from './initialize-run';

describe('initializeReleaseToRevenueRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockSyncStoreListingForRun).toHaveBeenCalledWith({
      workflowRunId: 'run-1',
      stepOutputs: {
        releaseId: 'release-1',
        release: { title: 'Launch Track' },
      },
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'waiting_for_approval',
        currentStep: 'awaiting_approval',
      })
    );
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
