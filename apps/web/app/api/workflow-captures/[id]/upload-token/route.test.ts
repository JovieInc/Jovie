import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  handleUploadPresigned: vi.fn(),
  issueSignedToken: vi.fn(),
  loadCapture: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@vercel/blob/client', () => ({
  handleUploadPresigned: hoisted.handleUploadPresigned,
}));

vi.mock('@vercel/blob', () => ({
  issueSignedToken: hoisted.issueSignedToken,
}));

vi.mock('@/lib/workflow-capture/server', () => ({
  loadOwnedWorkflowCapture: hoisted.loadCapture,
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

const { POST } = await import('./route');

const routeParams = { params: Promise.resolve({ id: 'capture-1' }) };

describe('POST /api/workflow-captures/[id]/upload-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.loadCapture.mockResolvedValue({
      status: 'pending',
      executionResult: null,
      payload: { expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    hoisted.issueSignedToken.mockResolvedValue({
      delegationToken: 'delegation',
      clientSigningToken: 'signing',
      validUntil: Date.now() + 60_000,
    });
    hoisted.handleUploadPresigned.mockImplementation(async options => {
      await options.getSignedToken(
        'workflow-captures/user-1/capture-1/recording.webm',
        null,
        false
      );
      return {
        type: 'blob.generate-presigned-url',
        presignedUrlPayload: {
          url: 'https://api.vercel.com/v2/blob/presigned',
        },
      };
    });
  });

  it('issues a private upload token only within the owner-scoped prefix', async () => {
    const response = await POST(
      new NextRequest(
        'https://jov.ie/api/workflow-captures/capture-1/upload-token',
        {
          method: 'POST',
          body: JSON.stringify({ type: 'blob.generate-presigned-url' }),
        }
      ),
      routeParams
    );

    expect(response.status).toBe(200);
    expect(hoisted.loadCapture).toHaveBeenCalledWith('capture-1', 'user-1');
    expect(await response.json()).toMatchObject({
      presignedUrlPayload: {
        url: 'https://api.vercel.com/v2/blob/presigned',
      },
    });
  });

  it('rejects a pathname outside the owner-scoped prefix', async () => {
    hoisted.handleUploadPresigned.mockImplementation(async options => {
      await options.getSignedToken(
        'workflow-captures/other/capture-1/x.webm',
        null,
        false
      );
    });

    const response = await POST(
      new NextRequest(
        'https://jov.ie/api/workflow-captures/capture-1/upload-token',
        {
          method: 'POST',
          body: JSON.stringify({ type: 'blob.generate-presigned-url' }),
        }
      ),
      routeParams
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid-capture-path' });
  });

  it('refuses tokens after a capture has already been uploaded', async () => {
    hoisted.loadCapture.mockResolvedValue({
      status: 'pending',
      executionResult: { state: 'uploaded_needs_review' },
      payload: { expiresAt: '2099-01-01T00:00:00.000Z' },
    });

    const response = await POST(
      new NextRequest(
        'https://jov.ie/api/workflow-captures/capture-1/upload-token',
        {
          method: 'POST',
          body: JSON.stringify({ type: 'blob.generate-presigned-url' }),
        }
      ),
      routeParams
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'capture-request-unavailable',
    });
  });
});
