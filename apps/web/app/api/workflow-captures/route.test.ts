import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createRequest: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/workflow-capture/server', () => ({
  createWorkflowCaptureRequest: hoisted.createRequest,
  WorkflowCaptureError: class WorkflowCaptureError extends Error {},
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { POST } = await import('./route');

describe('POST /api/workflow-captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.createRequest.mockResolvedValue({
      captureId: 'capture-1',
      requestingTaskId: 'task-1',
      state: 'pending',
    });
  });

  it('creates an owner-scoped workflow request', async () => {
    const response = await POST(
      new Request('https://jov.ie/api/workflow-captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestingTaskId: 'task-1',
          title: 'Record YouTube Studio workflow',
          instructions: 'Start an experiment and stop before publishing.',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(hoisted.createRequest).toHaveBeenCalledWith({
      userId: 'user-1',
      request: expect.objectContaining({ requestingTaskId: 'task-1' }),
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      receipt: { captureId: 'capture-1', state: 'pending' },
    });
  });

  it('rejects malformed requests before persistence', async () => {
    const response = await POST(
      new Request('https://jov.ie/api/workflow-captures', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      })
    );

    expect(response.status).toBe(400);
    expect(hoisted.createRequest).not.toHaveBeenCalled();
  });

  it('returns the authentication response unchanged', async () => {
    hoisted.requireAuth.mockResolvedValue({
      userId: null,
      error: new Response('Unauthorized', { status: 401 }),
    });

    const response = await POST(
      new Request('https://jov.ie/api/workflow-captures')
    );

    expect(response.status).toBe(401);
    expect(hoisted.createRequest).not.toHaveBeenCalled();
  });
});
