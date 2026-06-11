import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAnd,
  mockCaptureError,
  mockCaptureWarning,
  mockDb,
  mockEq,
  mockExecuteApprovedAction,
  mockInArray,
  mockIsNull,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLt,
  mockLte,
  mockMarkWorkflowFailed,
  mockOr,
  mockVerifyCronRequest,
} = vi.hoisted(() => ({
  mockAnd: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  mockCaptureError: vi.fn(),
  mockCaptureWarning: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn((column: unknown, value: unknown) => ({
    type: 'eq',
    column,
    value,
  })),
  mockExecuteApprovedAction: vi.fn(),
  mockInArray: vi.fn((column: unknown, values: unknown[]) => ({
    type: 'inArray',
    column,
    values,
  })),
  mockIsNull: vi.fn((column: unknown) => ({ type: 'isNull', column })),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLt: vi.fn((column: unknown, value: unknown) => ({
    type: 'lt',
    column,
    value,
  })),
  mockLte: vi.fn((column: unknown, value: unknown) => ({
    type: 'lte',
    column,
    value,
  })),
  mockMarkWorkflowFailed: vi.fn(),
  mockOr: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  mockVerifyCronRequest: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
  isNull: mockIsNull,
  lt: mockLt,
  lte: mockLte,
  or: mockOr,
}));

vi.mock('@/lib/connectors/workflows/execute-approved-action', () => ({
  executeApprovedAction: mockExecuteApprovedAction,
  markWorkflowFailed: mockMarkWorkflowFailed,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

function setupDbChains() {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: 'workflow-run-1',
        kind: 'execute_approved_action',
      },
    ]),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: 'workflow-run-1',
        kind: 'execute_approved_action',
      },
    ]),
  };

  mockDb.select.mockReturnValue(selectChain);
  mockDb.update.mockReturnValue(updateChain);

  return { selectChain, updateChain };
}

describe('GET /api/cron/process-workflow-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExecuteApprovedAction.mockResolvedValue(undefined);
    mockMarkWorkflowFailed.mockResolvedValue(undefined);
    mockVerifyCronRequest.mockReturnValue(null);
  });

  it('claims queued workflow runs before executing them', async () => {
    const { selectChain, updateChain } = setupDbChains();
    const { workflowRuns } = await import('@/lib/db/schema/connectors');
    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');

    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: { authorization: 'Bearer test-secret' },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      claimed: 1,
      processed: 1,
      failed: 0,
    });
    const queuedStatusChecks = mockEq.mock.calls.filter(
      ([column, value]) => column === workflowRuns.status && value === 'queued'
    );
    expect(queuedStatusChecks.length).toBeGreaterThanOrEqual(1);
    const dueRunAtChecks = mockLte.mock.calls.filter(
      ([column]) => column === workflowRuns.runAt
    );
    expect(dueRunAtChecks).toHaveLength(2);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        claimedAt: expect.any(Date),
        leaseExpiresAt: expect.any(Date),
      })
    );
    expect(selectChain.limit).toHaveBeenCalledWith(20);
    expect(mockExecuteApprovedAction).toHaveBeenCalledWith({
      workflowRunId: 'workflow-run-1',
    });
    expect(mockCaptureWarning).not.toHaveBeenCalled();
    expect(mockVerifyCronRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        route: '/api/cron/process-workflow-runs',
        requireTrustedOrigin: true,
      })
    );
  });
});
