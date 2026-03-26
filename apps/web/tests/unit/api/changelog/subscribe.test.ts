import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectLimit = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockLimiterLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());
const mockGetClientIP = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockSelectLimit,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet,
    })),
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  },
}));

vi.mock('@/lib/db/schema/product-update-subscribers', () => ({
  productUpdateSubscribers: {
    email: 'email',
    id: 'id',
  },
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/email/templates/changelog-verify', () => ({
  getChangelogVerifyEmail: vi.fn(() => ({
    subject: 'Verify',
    text: 'Verify text',
    html: '<p>Verify</p>',
  })),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/server-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/http/server-fetch')
  >('@/lib/http/server-fetch');

  return {
    ...actual,
    serverFetch: mockServerFetch,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  changelogSubscribeLimiter: {
    limit: mockLimiterLimit,
  },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  getClientIP: mockGetClientIP,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

function buildRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/changelog/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/changelog/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetClientIP.mockReturnValue('127.0.0.1');
    mockCreateRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '1',
    });
    mockLimiterLimit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 10_000,
    });
    mockSelectLimit.mockResolvedValue([]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({
      where: mockUpdateWhere,
    });
    mockInsertValues.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
    mockServerFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'turnstile-secret');
  });

  it('returns 503 when the durable rate limiter is unavailable', async () => {
    mockLimiterLimit.mockResolvedValue({
      success: false,
      reason: 'Rate limiter temporarily unavailable',
      limit: 1,
      remaining: 0,
      reset: Date.now() + 10_000,
    });

    const { POST } = await import('@/app/api/changelog/subscribe/route');
    const response = await POST(
      buildRequest({
        email: 'test@example.com',
        turnstileToken: 'token',
      }) as never
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Subscription is temporarily unavailable.',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('returns 503 when Turnstile verification is unavailable', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 10_000, 'Turnstile verification')
    );

    const { POST } = await import('@/app/api/changelog/subscribe/route');
    const response = await POST(
      buildRequest({
        email: 'test@example.com',
        turnstileToken: 'token',
      }) as never
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Bot verification unavailable. Please try again.',
    });
  });

  it('returns 502 when the confirmation email cannot be sent', async () => {
    mockSendEmail.mockRejectedValue(new Error('smtp unavailable'));

    const { POST } = await import('@/app/api/changelog/subscribe/route');
    const response = await POST(
      buildRequest({
        email: 'test@example.com',
        turnstileToken: 'token',
      }) as never
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Confirmation email unavailable. Please try again.',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to send changelog verification email',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/changelog/subscribe',
        email: 'test@example.com',
      })
    );
  });

  it('creates a subscriber and returns 201 on success', async () => {
    const { POST } = await import('@/app/api/changelog/subscribe/route');
    const response = await POST(
      buildRequest({
        email: 'test@example.com',
        turnstileToken: 'token',
      }) as never
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: 'Check your email to confirm your subscription!',
    });
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
