import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicProfileLimiterLimit = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() =>
  vi.fn().mockReturnValue('127.0.0.1')
);
const mockDetectBot = vi.hoisted(() =>
  vi.fn().mockReturnValue({ isBot: false })
);
const mockShouldExcludeSelfByHandle = vi.hoisted(() => vi.fn());
const mockIncrementProfileViews = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();

  return {
    ...actual,
    publicProfileLimiter: {
      limit: mockPublicProfileLimiterLimit,
    },
  };
});

vi.mock('@/lib/analytics/self-exclusion', () => ({
  shouldExcludeSelfByHandle: mockShouldExcludeSelfByHandle,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/services/profile', () => ({
  incrementProfileViews: mockIncrementProfileViews,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mockDetectBot,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

const { POST } = await import('@/app/api/profile/view/route');

function buildRequest() {
  return new NextRequest('http://localhost/api/profile/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: 'dualipa' }),
  });
}

describe('POST /api/profile/view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicProfileLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
    mockShouldExcludeSelfByHandle.mockResolvedValue(false);
  });

  it('returns a silent success when the client IP rate limit is exceeded', async () => {
    mockPublicProfileLimiterLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mockDetectBot).not.toHaveBeenCalled();
    expect(mockIncrementProfileViews).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('records a view when the request is under the limit', async () => {
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockPublicProfileLimiterLimit).toHaveBeenNthCalledWith(
      1,
      '127.0.0.1'
    );
    expect(mockPublicProfileLimiterLimit).toHaveBeenNthCalledWith(
      2,
      'dualipa:127.0.0.1'
    );
    expect(mockDetectBot).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '/api/profile/view'
    );
    expect(mockIncrementProfileViews).toHaveBeenCalledWith('dualipa');
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
