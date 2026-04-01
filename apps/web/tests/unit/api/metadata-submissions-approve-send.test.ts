import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getAuthenticatedSubmissionRequestMock: vi.fn(),
  approveAndQueueMetadataSubmissionMock: vi.fn(),
  processQueuedMetadataSubmissionsMock: vi.fn(),
  captureErrorMock: vi.fn(),
  MetadataSubmissionStateError: class MetadataSubmissionStateError extends Error {},
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/submission-agent/service', () => ({
  approveAndQueueMetadataSubmission:
    hoisted.approveAndQueueMetadataSubmissionMock,
  getAuthenticatedSubmissionRequest:
    hoisted.getAuthenticatedSubmissionRequestMock,
  MetadataSubmissionStateError: hoisted.MetadataSubmissionStateError,
}));

vi.mock('@/lib/submission-agent/send-worker', () => ({
  processQueuedMetadataSubmissions:
    hoisted.processQueuedMetadataSubmissionsMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('POST /api/metadata-submissions/approve-send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.getAuthenticatedSubmissionRequestMock.mockResolvedValue({
      request: {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'awaiting_approval',
      },
    });
    hoisted.approveAndQueueMetadataSubmissionMock.mockResolvedValue(undefined);
    hoisted.processQueuedMetadataSubmissionsMock.mockResolvedValue([
      {
        requestId: '33333333-3333-4333-8333-333333333333',
        status: 'sent',
      },
    ]);
  });

  it('returns the send result for owned requests', async () => {
    const { POST } = await import(
      '@/app/api/metadata-submissions/approve-send/route'
    );

    const response = await POST(
      new Request('http://localhost/api/metadata-submissions/approve-send', {
        method: 'POST',
        body: JSON.stringify({
          requestId: '33333333-3333-4333-8333-333333333333',
          confirmSend: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.result.status).toBe('sent');
  });

  it('returns 409 when the request can no longer be approved', async () => {
    hoisted.approveAndQueueMetadataSubmissionMock.mockRejectedValue(
      new hoisted.MetadataSubmissionStateError(
        'Only awaiting approval requests can be queued'
      )
    );

    const { POST } = await import(
      '@/app/api/metadata-submissions/approve-send/route'
    );

    const response = await POST(
      new Request('http://localhost/api/metadata-submissions/approve-send', {
        method: 'POST',
        body: JSON.stringify({
          requestId: '33333333-3333-4333-8333-333333333333',
          confirmSend: true,
        }),
      })
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error).toContain('awaiting approval');
    expect(hoisted.captureErrorMock).not.toHaveBeenCalled();
  });
});
