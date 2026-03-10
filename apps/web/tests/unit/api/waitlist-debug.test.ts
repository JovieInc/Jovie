import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureException = vi.hoisted(() => vi.fn());
const mockStartSpan = vi.hoisted(() =>
  vi.fn(async (_config, callback) => {
    const span = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
    };
    return callback(span);
  })
);
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: mockCaptureException,
  startSpan: mockStartSpan,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
  },
}));

describe('/api/waitlist-debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a successful response for GET', async () => {
    const { GET } = await import('@/app/api/waitlist-debug/route');
    const response = await GET(
      new Request('http://localhost/api/waitlist-debug', {
        method: 'GET',
      }) as unknown as NextRequest
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('captures errors through withSentryApiRoute', async () => {
    mockLoggerInfo.mockImplementationOnce(() => {
      throw new Error('logger failed');
    });

    const { POST } = await import('@/app/api/waitlist-debug/route');

    await expect(
      POST(
        new Request('http://localhost/api/waitlist-debug', {
          method: 'POST',
        }) as unknown as NextRequest
      )
    ).rejects.toThrow('logger failed');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          route: '/api/waitlist-debug',
          method: 'POST',
        }),
        tags: expect.objectContaining({
          route: '/api/waitlist-debug',
          method: 'POST',
        }),
      })
    );
  });
});
