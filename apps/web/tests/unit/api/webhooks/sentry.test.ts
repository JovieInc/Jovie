import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockAcquireRecentDispatch = vi.hoisted(() => vi.fn());
const mockClearRecentDispatch = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    SENTRY_WEBHOOK_SECRET: 'sentry-secret',
    GH_DISPATCH_TOKEN: 'gh-token',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
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

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  acquireRecentDispatch: mockAcquireRecentDispatch,
  clearRecentDispatch: mockClearRecentDispatch,
}));

function sign(body: string): string {
  return createHmac('sha256', 'sentry-secret').update(body).digest('hex');
}

describe('POST /api/webhooks/sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns deduplicated response when a recent dispatch exists', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'duplicate',
    });

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true, deduplicated: true });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 503 when webhook dedupe backend is unavailable', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'backend_unavailable',
    });

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Webhook dedupe unavailable',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Sentry webhook dedupe backend unavailable',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/sentry',
        issueId: '42',
      })
    );
  });

  it('returns 502 when the GitHub dispatch times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 10000, 'Sentry dispatch')
    );

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data).toEqual({ error: 'Dispatch timed out' });
    expect(mockClearRecentDispatch).toHaveBeenCalledWith('sentry', '42');
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Sentry webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/sentry',
        timeoutMs: 10000,
      })
    );
  });

  it('uses transport-only retries for the GitHub dispatch POST', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/TheBlackFuture/Jovie/dispatches',
      expect.objectContaining({
        method: 'POST',
        retry: expect.objectContaining({
          maxRetries: 2,
          baseDelayMs: 500,
          retryOn: expect.any(Function),
        }),
      })
    );

    const retryOn = mockServerFetch.mock.calls[0]?.[1]?.retry?.retryOn;
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    expect(
      retryOn?.({
        error: new ServerFetchTimeoutError('timed out', 10_000, 'Dispatch'),
      })
    ).toBe(true);
    expect(retryOn?.({ error: new TypeError('fetch failed') })).toBe(true);
    expect(
      retryOn?.({ response: new Response('retry', { status: 503 }) })
    ).toBe(false);
  });
});
