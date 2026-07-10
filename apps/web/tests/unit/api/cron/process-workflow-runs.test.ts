import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TRUSTED_CRON_HEADERS = {
  'x-forwarded-host': 'staging.jov.ie',
} as const;

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
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockExecuteApprovedAction.mockResolvedValue(undefined);
    mockMarkWorkflowFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: {
          Authorization: 'Bearer wrong-secret',
          ...TRUSTED_CRON_HEADERS,
        },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns 401 without authorization', async () => {
    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: TRUSTED_CRON_HEADERS,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns 403 for untrusted origins before bearer auth', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: {
          Authorization: 'Bearer test-secret',
          'x-forwarded-host': 'attacker-project.vercel.app',
        },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('skips the tick when connector workflow tables are not migrated', async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error(
        'Failed query: select "id", "kind" from "workflow_runs"',
        {
          cause: {
            code: '42P01',
            message: 'relation "workflow_runs" does not exist',
          },
        }
      );
    });

    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: {
          Authorization: 'Bearer test-secret',
          ...TRUSTED_CRON_HEADERS,
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      processed: 0,
      skipped: true,
      error: 'Workflow tables are not migrated',
    });
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('claims queued workflow runs before executing them', async () => {
    const { selectChain, updateChain } = setupDbChains();
    const { workflowRuns } = await import('@/lib/db/schema/connectors');
    const { GET } = await import('@/app/api/cron/process-workflow-runs/route');

    const response = await GET(
      new Request('http://localhost/api/cron/process-workflow-runs', {
        headers: {
          Authorization: 'Bearer test-secret',
          ...TRUSTED_CRON_HEADERS,
        },
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
  });
});
