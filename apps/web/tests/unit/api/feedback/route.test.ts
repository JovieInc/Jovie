import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCreateFeedbackItem = vi.hoisted(() => vi.fn());
const mockNotifySlackFeedbackSubmission = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: mockCreateFeedbackItem,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackFeedbackSubmission: mockNotifySlackFeedbackSubmission,
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockAuth.mockResolvedValue({ userId: 'clerk_1' });
    mockFindFirst.mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      email: 'test@example.com',
    });
    mockCreateFeedbackItem.mockResolvedValue({ id: 'feedback_1' });
    mockNotifySlackFeedbackSubmission.mockResolvedValue(undefined);
  });

  it('returns success only after persistence', async () => {
    const { POST } = await import('@/app/api/feedback/route');

    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Excellent product direction' }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: 'feedback_1',
    });
  });

  it('returns non-200 when persistence fails', async () => {
    mockCreateFeedbackItem.mockRejectedValue(new Error('insert failed'));

    const { POST } = await import('@/app/api/feedback/route');

    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Excellent product direction' }),
      })
    );

    expect(response.status).toBe(500);
    expect(mockNotifySlackFeedbackSubmission).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to submit feedback',
    });
  });

  it('logs error and calls captureError when feedback creation throws', async () => {
    const thrownError = new Error('insert failed');
    mockCreateFeedbackItem.mockRejectedValue(thrownError);

    const { POST } = await import('@/app/api/feedback/route');

    await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Excellent product direction' }),
      })
    );

    expect(mockLoggerError).toHaveBeenCalledWith(
      '[api/feedback] Failed to submit feedback:',
      thrownError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Feedback submission failed',
      thrownError,
      { route: '/api/feedback', method: 'POST' }
    );
  });
});
