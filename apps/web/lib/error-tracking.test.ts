import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureException = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());
const mockTrackEvent = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  getClient: mockGetClient,
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: () => 'full',
  isSentryInitialized: () => false,
}));

import { captureWarning } from './error-tracking';

function upstashError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstashError';
  return error;
}

describe('captureWarning wrapped UpstashError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue({});
    mockTrackEvent.mockResolvedValue(undefined);
  });

  it('captures the inner UpstashError instead of JSON.stringify({ error })', async () => {
    const inner = upstashError(
      'ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
    );

    await captureWarning('[waitlist-gate] Redis cache read failed', {
      error: inner,
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [captured, options] = mockCaptureException.mock.calls[0] as [
      Error,
      { fingerprint?: string[]; tags?: Record<string, string> },
    ];
    expect(captured).toBe(inner);
    expect(captured.message).toContain('max requests limit exceeded');
    expect(options.fingerprint).toEqual(['redis-quota-exceeded']);
    expect(options.tags?.error_class).toBe('redis_quota_exceeded');
  });

  it('moves clerkUserId from the wrapper into Sentry extra, not the title', async () => {
    const inner = upstashError(
      'ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
    );

    await captureWarning('[ban-check] Redis cache read failed', {
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: inner,
    });

    const [captured, options] = mockCaptureException.mock.calls[0] as [
      Error,
      { extra?: Record<string, unknown> },
    ];
    expect(captured).toBe(inner);
    expect(options.extra?.clerkUserId).toBe(
      'af5b9ee0-ecec-4508-86e0-4f364c2e349d'
    );
  });
});
