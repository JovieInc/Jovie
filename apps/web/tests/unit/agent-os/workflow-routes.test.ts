import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentOsDryRunArtifact } from '@/workflows/agent-os-dry-run';

const {
  mockAreAgentOsWorkflowsEnabled,
  mockGetCurrentUserEntitlements,
  mockGetRun,
  mockIsWorkflowRunNotFoundError,
  mockStart,
} = vi.hoisted(() => ({
  mockAreAgentOsWorkflowsEnabled: vi.fn(),
  mockGetCurrentUserEntitlements: vi.fn(),
  mockGetRun: vi.fn(),
  mockIsWorkflowRunNotFoundError: vi.fn(),
  mockStart: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/agent-os/workflows', () => ({
  areAgentOsWorkflowsEnabled: mockAreAgentOsWorkflowsEnabled,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('workflow/api', () => ({
  getRun: mockGetRun,
  start: mockStart,
}));

vi.mock('workflow/errors', () => ({
  WorkflowRunNotFoundError: {
    is: mockIsWorkflowRunNotFoundError,
  },
}));

const adminEntitlements = {
  userId: 'user_admin',
  email: 'admin@example.com',
  isAuthenticated: true,
  isAdmin: true,
};

function request(url: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(url, init);
}

describe('AgentOS workflow API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAreAgentOsWorkflowsEnabled.mockReturnValue(true);
    mockGetCurrentUserEntitlements.mockResolvedValue(adminEntitlements);
    mockIsWorkflowRunNotFoundError.mockReturnValue(false);
    mockStart.mockResolvedValue({ runId: 'wrun_123' });
  });

  it('fails closed when workflow runtime is disabled', async () => {
    mockAreAgentOsWorkflowsEnabled.mockReturnValueOnce(false);
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    const response = await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'AgentOS workflows are disabled',
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('requires admin entitlement before starting a dry-run workflow', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      ...adminEntitlements,
      isAdmin: false,
    });
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    const response = await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts the WDK dry-run workflow with admin-scoped input', async () => {
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    const response = await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
        body: JSON.stringify({ sourceRunId: 'manual-proof' }),
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runId: 'wrun_123',
      statusUrl: '/api/admin/agent-os/workflows/runs/wrun_123',
    });
    expect(mockStart).toHaveBeenCalledWith(expect.any(Function), [
      {
        requestedBy: 'admin@example.com',
        sourceRunId: 'manual-proof',
      },
    ]);
  });

  it('does not let request bodies spoof the admin requester', async () => {
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
        body: JSON.stringify({
          requestedBy: 'spoofed@example.com',
          sourceRunId: 'manual-proof',
        }),
      })
    );

    expect(mockStart).toHaveBeenCalledWith(expect.any(Function), [
      {
        requestedBy: 'admin@example.com',
        sourceRunId: 'manual-proof',
      },
    ]);
  });

  it('generates a stable source run id before enqueueing default dry-run input', async () => {
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
      })
    );

    expect(mockStart).toHaveBeenCalledWith(expect.any(Function), [
      {
        requestedBy: 'admin@example.com',
        sourceRunId: expect.stringMatching(/^agentos-dry-run-[0-9a-f-]{36}$/),
      },
    ]);
  });

  it('rejects malformed JSON without starting a workflow run', async () => {
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    const response = await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
        body: '{',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Malformed JSON request body',
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('rejects source run ids that would overflow the artifact id before enqueue', async () => {
    const { POST } = await import(
      '@/app/api/admin/agent-os/workflows/dry-run/route'
    );

    const response = await POST(
      request('http://localhost/api/admin/agent-os/workflows/dry-run', {
        method: 'POST',
        body: JSON.stringify({ sourceRunId: 'a'.repeat(161) }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid AgentOS dry-run workflow request',
      issues: [expect.objectContaining({ path: ['sourceRunId'] })],
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('fails closed when status is requested while workflows are disabled', async () => {
    mockAreAgentOsWorkflowsEnabled.mockReturnValueOnce(false);
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
      { params: Promise.resolve({ runId: 'wrun_123' }) }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'AgentOS workflows are disabled',
    });
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it('requires authentication before returning workflow status', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      ...adminEntitlements,
      isAuthenticated: false,
      isAdmin: false,
    });
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
      { params: Promise.resolve({ runId: 'wrun_123' }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it('requires admin entitlement before returning workflow status', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      ...adminEntitlements,
      isAdmin: false,
    });
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
      { params: Promise.resolve({ runId: 'wrun_123' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it('returns WDK run status and completed artifact', async () => {
    const completedAt = new Date('2026-05-08T21:35:00.000Z');
    const artifact = buildAgentOsDryRunArtifact({
      input: { requestedBy: 'admin@example.com', sourceRunId: 'wrun_123' },
      createdAt: completedAt,
    });
    mockGetRun.mockReturnValueOnce({
      status: Promise.resolve('completed'),
      workflowName: Promise.resolve('agentOsDryRunWorkflow'),
      createdAt: Promise.resolve(completedAt),
      startedAt: Promise.resolve(completedAt),
      completedAt: Promise.resolve(completedAt),
      returnValue: Promise.resolve(artifact),
    });
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
      { params: Promise.resolve({ runId: 'wrun_123' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runId: 'wrun_123',
      status: 'completed',
      workflowName: 'agentOsDryRunWorkflow',
      createdAt: completedAt.toISOString(),
      startedAt: completedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      artifact,
    });
  });

  it('does not poll returnValue for an incomplete run', async () => {
    const createdAt = new Date('2026-05-08T21:35:00.000Z');
    const run = {
      status: Promise.resolve('running'),
      workflowName: Promise.resolve('agentOsDryRunWorkflow'),
      createdAt: Promise.resolve(createdAt),
      startedAt: Promise.resolve(createdAt),
      completedAt: Promise.resolve(undefined),
      get returnValue() {
        throw new Error('returnValue should not be read while running');
      },
    };
    mockGetRun.mockReturnValueOnce(run);
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
      { params: Promise.resolve({ runId: 'wrun_123' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      runId: 'wrun_123',
      status: 'running',
      artifact: null,
    });
  });

  it('returns 404 when a run cannot be resolved', async () => {
    const missingRunError = new Error('missing');
    mockIsWorkflowRunNotFoundError.mockImplementationOnce(
      (error: unknown) => error === missingRunError
    );
    mockGetRun.mockReturnValueOnce({
      status: Promise.reject(missingRunError),
      workflowName: Promise.resolve('agentOsDryRunWorkflow'),
      createdAt: Promise.resolve(undefined),
      startedAt: Promise.resolve(undefined),
      completedAt: Promise.resolve(undefined),
    });
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    const response = await GET(
      request(
        'http://localhost/api/admin/agent-os/workflows/runs/wrun_missing'
      ),
      { params: Promise.resolve({ runId: 'wrun_missing' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Workflow run wrun_missing was not found',
    });
  });

  it('returns 500 when workflow status resolution fails for an existing run', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockGetRun.mockReturnValueOnce({
      status: Promise.reject(new Error('workflow backend unavailable')),
      workflowName: Promise.resolve('agentOsDryRunWorkflow'),
      createdAt: Promise.resolve(undefined),
      startedAt: Promise.resolve(undefined),
      completedAt: Promise.resolve(undefined),
    });
    const { GET } = await import(
      '@/app/api/admin/agent-os/workflows/runs/[runId]/route'
    );

    try {
      const response = await GET(
        request('http://localhost/api/admin/agent-os/workflows/runs/wrun_123'),
        { params: Promise.resolve({ runId: 'wrun_123' }) }
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to load workflow run status',
      });
      expect(consoleError).toHaveBeenCalledWith(
        '[agentOsDryRun] Failed to load workflow run status',
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
