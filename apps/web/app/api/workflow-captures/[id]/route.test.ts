import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getReceipt: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/workflow-capture/server', () => ({
  getWorkflowCaptureReceipt: hoisted.getReceipt,
  mutateWorkflowCapture: hoisted.mutate,
  WorkflowCaptureError: class WorkflowCaptureError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number
    ) {
      super(code);
    }
  },
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { GET, PATCH } = await import('./route');
const { WorkflowCaptureError } = await import('@/lib/workflow-capture/server');

const params = { params: Promise.resolve({ id: 'capture-1' }) };

describe('/api/workflow-captures/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
  });

  it('returns the capture error when loading the receipt throws', async () => {
    hoisted.getReceipt.mockRejectedValue(
      new WorkflowCaptureError('capture-not-found', 404)
    );

    const response = await GET(
      new Request('https://jov.ie/api/workflow-captures/capture-1'),
      params
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'capture-not-found' });
    expect(hoisted.getReceipt).toHaveBeenCalledWith('capture-1', 'user-1');
  });

  it('returns the capture error when a mutation throws', async () => {
    hoisted.mutate.mockRejectedValue(
      new WorkflowCaptureError('capture-request-unavailable', 410)
    );

    const response = await PATCH(
      new Request('https://jov.ie/api/workflow-captures/capture-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      }),
      params
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'capture-request-unavailable',
    });
    expect(hoisted.mutate).toHaveBeenCalledWith({
      captureId: 'capture-1',
      userId: 'user-1',
      mutation: { action: 'revoke' },
    });
  });
});
